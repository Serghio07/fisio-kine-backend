const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomUUID() + randomUUID();
const app = require('../src/app');
const { Usuario, AdjuntoHistoriaClinica, ActividadSistema } = require('../src/models');

test('acceso HTTP a adjuntos privados y contenido publico', async (t) => {
  const filename = `access-test-${randomUUID()}.pdf`;
  const privateContent = '%PDF-1.7\nDOCUMENTO FICTICIO DE PRUEBA';
  const fixtures = [];
  const originalUser = Usuario.findByPk;
  const originalAttachment = AdjuntoHistoriaClinica.findOne;
  const originalAudit = ActividadSistema.create;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    Usuario.findByPk = originalUser;
    AdjuntoHistoriaClinica.findOne = originalAttachment;
    ActividadSistema.create = originalAudit;
    await Promise.all(fixtures.map((file) => fs.unlink(file)));
  });
  for (const folder of ['adjuntos-historia', 'blog', 'galeria']) {
    const directory = path.resolve(__dirname, '../uploads', folder);
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, filename);
    await fs.writeFile(file, folder === 'adjuntos-historia' ? privateContent : 'IMAGEN PUBLICA FICTICIA', { flag: 'wx' });
    fixtures.push(file);
  }
  // Sesion y registros ficticios: estas pruebas no consultan ni modifican la BD.
  Usuario.findByPk = async (id) => ({ id, rol: id === 3 ? 'otro' : id === 2 ? 'personal' : 'admin', estado: 'activo', activo: true });
  ActividadSistema.create = async () => ({});
  AdjuntoHistoriaClinica.findOne = async ({ where }) => {
    assert.equal(where.activo, true);
    assert.equal(where.eliminado, false);
    return String(where.id) === '999999' ? { archivo: filename, mime_type: 'application/pdf', nombre_archivo_original: 'prueba.pdf' } : null;
  };
  server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const request = (requestPath, { method = 'GET', userId } = {}) => new Promise((resolve, reject) => {
    const headers = userId ? { Authorization: `Bearer ${jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '5m' })}` } : {};
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: requestPath, method, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });

  await t.test('URL directa devuelve 404 incluso con sesion o con HEAD', async () => {
    for (const options of [{}, { method: 'HEAD' }, { userId: 1 }]) {
      const response = await request(`/uploads/adjuntos-historia/${filename}`, options);
      assert.equal(response.status, 404);
      assert.doesNotMatch(response.body, /DOCUMENTO FICTICIO/);
      assert.equal(response.headers['cache-control'], 'no-store');
    }
  });
  await t.test('rutas codificadas y traversal no entregan el adjunto', async () => {
    for (const prefix of ['adjuntos%2dhistoria', '%61djuntos-historia', 'ADJUNTOS-HISTORIA', 'blog/../adjuntos-historia', 'blog/%2e%2e/adjuntos-historia', 'galeria/..%2fadjuntos-historia', 'blog/..%5cadjuntos-historia']) {
      const response = await request(`/uploads/${prefix}/${filename}`);
      assert.ok(response.status >= 400, `${prefix}: ${response.status}`);
      assert.doesNotMatch(response.body, /DOCUMENTO FICTICIO/);
    }
  });
  await t.test('blog y galeria siguen disponibles sin sesion', async () => {
    for (const folder of ['blog', 'galeria']) {
      const response = await request(`/uploads/${folder}/${filename}`);
      assert.equal(response.status, 200);
      assert.equal(response.body, 'IMAGEN PUBLICA FICTICIA');
    }
  });
  await t.test('ver y descargar requieren sesion', async () => {
    for (const action of ['archivo', 'descargar']) {
      const response = await request(`/api/adjuntos-historia/999999/${action}`);
      assert.equal(response.status, 401);
      assert.doesNotMatch(response.body, /DOCUMENTO FICTICIO/);
    }
  });
  await t.test('admin y personal pueden ver y descargar sin cache compartida', async () => {
    for (const userId of [1, 2]) {
      for (const action of ['archivo', 'descargar']) {
        const response = await request(`/api/adjuntos-historia/999999/${action}`, { userId });
        assert.equal(response.status, 200);
        assert.equal(response.body, privateContent);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        assert.ok(response.headers['content-disposition'].startsWith(action === 'archivo' ? 'inline' : 'attachment'));
      }
    }
  });
  await t.test('otros roles no pueden descargar', async () => {
    const response = await request('/api/adjuntos-historia/999999/archivo', { userId: 3 });
    assert.equal(response.status, 403);
    assert.doesNotMatch(response.body, /DOCUMENTO FICTICIO/);
  });
  await t.test('archivo inexistente o eliminado no se entrega', async () => {
    const response = await request('/api/adjuntos-historia/888888/archivo', { userId: 1 });
    assert.equal(response.status, 404);
  });
});
