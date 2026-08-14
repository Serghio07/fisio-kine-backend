const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const models = require('../src/models');
const registrarActividad = require('../src/middlewares/actividad.middleware');

test('limpia una instancia Sequelize sin conservar options, include ni ciclos', () => {
  const options = {};
  const include = [{ parent: options }];
  options.include = include;
  const instance = {
    dataValues: { id: 63, estado: 'Atendida', fecha: '2026-08-14' },
    _options: options,
    get: ({ plain }) => plain ? { ...instance.dataValues } : instance.dataValues
  };

  const limpio = registrarActividad.limpiarDatos({ cita: instance, options });
  assert.deepEqual(limpio, { cita: { id: 63, estado: 'Atendida', fecha: '2026-08-14' }, options: {} });
  assert.doesNotThrow(() => JSON.stringify(limpio));
  assert.doesNotMatch(JSON.stringify(limpio), /include|parent|_options/);
});

test('un fallo de auditoría no afecta la respuesta principal', async () => {
  const originalCreate = models.ActividadSistema.create;
  const originalError = console.error;
  let logged = '';
  models.ActividadSistema.create = async () => { throw new Error('fallo controlado de auditoría'); };
  console.error = (...args) => { logged = args.join(' '); };
  try {
    const req = { usuario: { id: 1 }, method: 'POST', originalUrl: '/api/citas', body: { paciente_id: 8 } };
    const res = new EventEmitter();
    res.statusCode = 201;
    res.json = (body) => body;
    let nextCalled = false;
    registrarActividad(req, res, () => { nextCalled = true; });
    const responseBody = { id: 78, estado: 'Programada' };
    assert.equal(res.json(responseBody), responseBody);
    res.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(nextCalled, true);
    assert.match(logged, /No se pudo registrar actividad: fallo controlado/);
  } finally {
    models.ActividadSistema.create = originalCreate;
    console.error = originalError;
  }
});
