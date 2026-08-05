const test = require('node:test');
const assert = require('node:assert/strict');
const Paciente = require('../../src/models/Paciente');
const {
  normalizePhoneNumber,
  maskPhoneNumber
} = require('../../src/utils/phone');
const {
  normalizarPaciente,
  validarPaciente,
  validarTelefonoUnico,
  isPhoneUniqueConstraintError,
  crearPaciente,
  actualizarPaciente,
  PHONE_DUPLICATE_MESSAGE,
  PHONE_INVALID_MESSAGE
} = require('../../src/controllers/paciente.controller');
const { auditPatientPhones } = require('../../src/scripts/auditPatientPhones');

test('normaliza formatos bolivianos y conserva un internacional extranjero', () => {
  assert.equal(normalizePhoneNumber('62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('+591 62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('591-62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('00591 (622) 95637'), '59162295637');
  assert.equal(normalizePhoneNumber('+1 202-555-0100'), '12025550100');
  assert.equal(normalizePhoneNumber(null), '');
  assert.equal(normalizePhoneNumber(''), '');
  assert.equal(normalizePhoneNumber('abc'), '');
  assert.equal(normalizePhoneNumber('123'), '');
  assert.equal(maskPhoneNumber('62295637'), '591*****637');
});

test('normalizacion de paciente guarda la columna internacional', () => {
  const data = normalizarPaciente({ telefono: '+591 622-95637' });
  assert.equal(data.telefono, '+591 622-95637');
  assert.equal(data.telefono_normalizado, '59162295637');
});

test('validacion rechaza telefono invalido', () => {
  const error = validarPaciente({
    nombres: 'ANA', apellidos: 'PEREZ', ci: '123', telefono: 'abc', sexo: 'FEMENINO'
  });
  assert.equal(error, PHONE_INVALID_MESSAGE);
});

test('validacion de unicidad excluye el paciente editado y no filtra por estado', async () => {
  const original = Paciente.findOne;
  let options;
  Paciente.findOne = async (value) => { options = value; return null; };
  try {
    assert.equal(await validarTelefonoUnico('59162295637', 8), true);
    assert.equal(options.where.telefono_normalizado, '59162295637');
    assert.ok(options.where.id);
    assert.equal(Object.prototype.hasOwnProperty.call(options.where, 'estado'), false);
  } finally {
    Paciente.findOne = original;
  }
});

test('reconoce solamente la restriccion unica del telefono', () => {
  assert.equal(isPhoneUniqueConstraintError({
    name: 'SequelizeUniqueConstraintError',
    parent: { constraint: 'pacientes_telefono_normalizado_unique' }
  }), true);
  assert.equal(isPhoneUniqueConstraintError({
    name: 'SequelizeUniqueConstraintError',
    parent: { constraint: 'pacientes_ci_unique' }
  }), false);
});

test('auditoria detecta duplicados sin modificar pacientes', async () => {
  let writes = 0;
  const patientModel = {
    findAll: async () => [
      { id: 1, telefono: '62295637', estado: true },
      { id: 2, telefono: '+591 62295637', estado: false },
      { id: 3, telefono: '70000000', estado: true }
    ],
    update: async () => { writes += 1; }
  };
  const result = await auditPatientPhones(patientModel);
  assert.deepEqual(result, [{
    phone: '591*****637',
    count: 2,
    patients: [{ id: 1, estado: true }, { id: 2, estado: false }]
  }]);
  assert.equal(writes, 0);
});

const validBody = {
  nombres: 'ANA',
  apellidos: 'PEREZ',
  ci: '1234567',
  telefono: '62295637',
  sexo: 'FEMENINO'
};

const responseDouble = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; }
});

test('creacion guarda telefono normalizado y no lo expone en la respuesta', async () => {
  const originalFindOne = Paciente.findOne;
  const originalCreate = Paciente.create;
  let created;
  Paciente.findOne = async () => null;
  Paciente.create = async (data) => {
    created = data;
    return Paciente.build({ id: 10, ...data });
  };
  const res = responseDouble();
  try {
    await crearPaciente({ body: validBody }, res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(created.telefono_normalizado, '59162295637');
    assert.equal(res.body.toJSON().telefono_normalizado, undefined);
  } finally {
    Paciente.findOne = originalFindOne;
    Paciente.create = originalCreate;
  }
});

test('creacion rechaza telefono equivalente de cualquier paciente con 409', async () => {
  const original = Paciente.findOne;
  let calls = 0;
  Paciente.findOne = async () => (++calls === 1 ? null : { id: 99, estado: false });
  const res = responseDouble();
  try {
    await crearPaciente({ body: { ...validBody, telefono: '+591 62295637' } }, res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { message: PHONE_DUPLICATE_MESSAGE });
    assert.equal(JSON.stringify(res.body).includes('99'), false);
  } finally {
    Paciente.findOne = original;
  }
});

test('edicion permite conservar su telefono y excluye su ID', async () => {
  const originalFindByPk = Paciente.findByPk;
  const originalFindOne = Paciente.findOne;
  const instance = {
    id: 7,
    toJSON: () => ({ id: 7, ...validBody, telefono_normalizado: '59162295637' }),
    update: async (data) => Object.assign(instance, data)
  };
  const seen = [];
  Paciente.findByPk = async () => instance;
  Paciente.findOne = async (options) => { seen.push(options); return null; };
  const res = responseDouble();
  try {
    await actualizarPaciente({ params: { id: '7' }, body: { telefono: '59162295637' } }, res, assert.fail);
    assert.equal(res.statusCode, 200);
    assert.ok(seen[1].where.id);
    assert.equal(instance.telefono_normalizado, '59162295637');
  } finally {
    Paciente.findByPk = originalFindByPk;
    Paciente.findOne = originalFindOne;
  }
});

test('condicion de carrera del indice unico se transforma en 409', async () => {
  const originalFindOne = Paciente.findOne;
  const originalCreate = Paciente.create;
  Paciente.findOne = async () => null;
  Paciente.create = async () => {
    const error = new Error('restriccion');
    error.name = 'SequelizeUniqueConstraintError';
    error.parent = { constraint: 'pacientes_telefono_normalizado_unique' };
    throw error;
  };
  const res = responseDouble();
  try {
    await crearPaciente({ body: validBody }, res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { message: PHONE_DUPLICATE_MESSAGE });
  } finally {
    Paciente.findOne = originalFindOne;
    Paciente.create = originalCreate;
  }
});
