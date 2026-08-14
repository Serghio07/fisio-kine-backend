const test = require('node:test');
const assert = require('node:assert/strict');
const { GaleriaImagen } = require('../src/models');
const controller = require('../src/controllers/galeria.controller');

const response = () => ({
  statusCode: 200, body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('normaliza y valida únicamente campos permitidos de Galería', () => {
  const payload = controller.payloadFrom({ titulo: '  Recepción  ', descripcion: '<script>texto</script>', categoria: 'Instalaciones', orden: '2', estado: 'PUBLICADO', campo_interno: 'no' }, 7);
  assert.deepEqual(payload, { titulo: 'Recepción', descripcion: null, categoria: 'Instalaciones', orden: 2, estado: 'PUBLICADO', modificadoPorId: 7 });
  assert.equal('campo_interno' in payload, false);
});

test('API pública solicita solo publicados, campos públicos y orden estable', async () => {
  const original = GaleriaImagen.findAll;
  let options;
  GaleriaImagen.findAll = async (value) => { options = value; return [{ id: 1, titulo: 'Sala' }]; };
  try {
    const res = response();
    await controller.publicList({}, res, (error) => { throw error; });
    assert.equal(options.where.estado, 'PUBLICADO');
    assert.deepEqual(options.attributes, ['id', 'titulo', 'descripcion', 'categoria', 'imagen', 'orden']);
    assert.deepEqual(options.order, [['orden', 'ASC'], ['id', 'ASC']]);
    assert.deepEqual(res.body, [{ id: 1, titulo: 'Sala' }]);
  } finally { GaleriaImagen.findAll = original; }
});

test('modelo restringe categorías y estados de Galería', () => {
  assert.deepEqual(GaleriaImagen.CATEGORIAS, ['Instalaciones', 'Equipamiento', 'Tratamientos', 'Especialistas']);
  assert.deepEqual(GaleriaImagen.ESTADOS, ['PUBLICADO', 'NO_PUBLICADO']);
});
