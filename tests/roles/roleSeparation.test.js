const assert = require('node:assert/strict');
const test = require('node:test');

const models = require('../../src/models');
const tareaController = require('../../src/controllers/tareaPersonal.controller');
const autorizarRoles = require('../../src/middlewares/role.middleware');
const { soloAdministradorFinanciero } = require('../../src/middlewares/financialAccess.middleware');

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('PERSONAL solo consulta las tareas creadas por su propio usuario', async () => {
  const originalFindAll = models.TareaPersonal.findAll;
  let receivedOptions;
  const tasks = [
    { id: 10, usuario_id: 22, titulo: 'Actividad de A' },
    { id: 11, usuario_id: 23, titulo: 'Actividad de B' }
  ];
  models.TareaPersonal.findAll = async (options) => {
    receivedOptions = options;
    return tasks.filter((task) => task.usuario_id === options.where.usuario_id);
  };

  try {
    const res = response();
    await tareaController.listar(
      { user: { id: 23, rol: 'personal' }, usuario: { id: 23, rol: 'personal' }, query: {} },
      res,
      (error) => { throw error; }
    );

    assert.equal(receivedOptions.where.usuario_id, 23);
    assert.deepEqual(res.body, [{ id: 11, usuario_id: 23, titulo: 'Actividad de B' }]);
    assert.equal(res.body.some((task) => task.usuario_id === 22), false);
  } finally {
    models.TareaPersonal.findAll = originalFindAll;
  }
});

test('ADMIN conserva la consulta global de tareas', async () => {
  const originalFindAll = models.TareaPersonal.findAll;
  let receivedOptions;
  models.TareaPersonal.findAll = async (options) => {
    receivedOptions = options;
    return [
      { id: 10, usuario_id: 22 },
      { id: 11, usuario_id: 23 }
    ];
  };

  try {
    const res = response();
    await tareaController.listar(
      { user: { id: 1, rol: 'admin' }, usuario: { id: 1, rol: 'admin' }, query: {} },
      res,
      (error) => { throw error; }
    );

    assert.equal(Object.hasOwn(receivedOptions.where, 'usuario_id'), false);
    assert.equal(res.body.length, 2);
  } finally {
    models.TareaPersonal.findAll = originalFindAll;
  }
});

test('un endpoint exclusivo de ADMIN responde 403 a PERSONAL', () => {
  const res = response();
  let continued = false;

  autorizarRoles('admin')(
    { user: { id: null, rol: 'personal' }, body: {}, query: {}, method: 'GET', originalUrl: '/api/usuarios' },
    res,
    () => { continued = true; }
  );

  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
});

test('el módulo financiero responde 403 a PERSONAL y permite ADMIN', () => {
  const personalResponse = response();
  soloAdministradorFinanciero(
    { user: { id: null, rol: 'personal' }, body: {}, query: {}, method: 'GET', originalUrl: '/api/planilla-pagos' },
    personalResponse,
    () => assert.fail('PERSONAL no debe continuar')
  );
  assert.equal(personalResponse.statusCode, 403);

  let adminContinued = false;
  soloAdministradorFinanciero(
    { user: { id: 1, rol: 'admin' } },
    response(),
    () => { adminContinued = true; }
  );
  assert.equal(adminContinued, true);
});
