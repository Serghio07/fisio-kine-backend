const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');
const authorizeRoles = require('../../src/middlewares/role.middleware');

test('API de contactos rechaza usuario no autenticado', async () => {
  const server = app.listen(0);
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/contactos`);
    assert.equal(response.status, 401);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('middleware de roles permite admin y personal', () => {
  for (const role of ['admin', 'personal']) {
    let passed = false;
    authorizeRoles('admin', 'personal')({ user: { id: 1, rol: role } }, {}, () => { passed = true; });
    assert.equal(passed, true);
  }
});

test('middleware de roles rechaza un rol no autorizado', () => {
  let status;
  const response = { status(code) { status = code; return this; }, json() { return this; } };
  authorizeRoles('admin', 'personal')({ user: { rol: 'consulta' }, body: {}, query: {}, method: 'POST', originalUrl: '/api/contactos' }, response, () => assert.fail('No debe continuar'));
  assert.equal(status, 403);
});
