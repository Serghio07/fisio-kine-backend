const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONTACT_TYPES,
  normalizePhoneNumber,
  buildPhoneCandidates,
  sanitizeFirstName,
  findPatientsByWhatsappPhone,
  identifyWhatsappContact
} = require('../../src/services/whatsappPatient.service');

test('normaliza formatos internacionales y locales', () => {
  assert.equal(normalizePhoneNumber('+591 62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('591-62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('+591.622.95637'), '59162295637');
  assert.equal(normalizePhoneNumber('(591) 62295637'), '59162295637');
  assert.equal(normalizePhoneNumber('622 95637'), '59162295637');
  assert.equal(normalizePhoneNumber(62295637), '59162295637');
  assert.equal(normalizePhoneNumber('00591 62295637'), '59162295637');
  assert.equal(normalizePhoneNumber(null), '');
  assert.equal(normalizePhoneNumber('abc'), '');
  assert.equal(normalizePhoneNumber('123'), '');
  assert.equal(normalizePhoneNumber('1234567890123456'), '');
});

test('genera candidatos bolivianos sin cambiar la normalizacion generica', () => {
  assert.deepEqual(buildPhoneCandidates('59162295637'), ['59162295637']);
  assert.deepEqual(buildPhoneCandidates('62295637'), ['59162295637']);
});

test('la consulta selecciona campos minimos, activos y limita ambiguedad', async () => {
  let queryOptions;
  const patientModel = {
    findAll: async (options) => {
      queryOptions = options;
      return [{ id: 1, nombres: 'Ana', estado: true }];
    }
  };
  const rows = await findPatientsByWhatsappPhone('+591 622-95637', patientModel);
  assert.equal(rows.length, 1);
  assert.deepEqual(queryOptions.attributes, ['id', 'nombres', 'estado']);
  assert.equal(queryOptions.where.telefono_normalizado, '59162295637');
  assert.equal(queryOptions.limit, 3);
  assert.equal(queryOptions.raw, true);
});

test('clasifica paciente existente y no devuelve el modelo completo', async () => {
  const result = await identifyWhatsappContact('59162295637', {
    patientModel: { findAll: async () => [{ id: 15, nombres: '  Sergio Alberto  ', estado: true, diagnostico: 'privado' }] }
  });
  assert.deepEqual(result, {
    type: CONTACT_TYPES.EXISTING,
    found: true,
    patient: { id: 15, firstName: 'Sergio', displayName: 'Sergio' }
  });
  assert.equal(JSON.stringify(result).includes('diagnostico'), false);
});

test('paciente sin nombre conserva saludo generico', async () => {
  const result = await identifyWhatsappContact('62295637', {
    patientModel: { findAll: async () => [{ id: 1, nombres: null, estado: true }] }
  });
  assert.equal(result.patient.firstName, '');
  assert.equal(sanitizeFirstName('  María José '), 'María');
});

test('clasifica nuevo, ambiguo e invalido', async () => {
  const nuevo = await identifyWhatsappContact('62295637', {
    patientModel: { findAll: async () => [] }
  });
  assert.equal(nuevo.type, CONTACT_TYPES.NEW);

  const ambiguo = await identifyWhatsappContact('62295637', {
    patientModel: { findAll: async () => [
      { id: 1, nombres: 'Ana', estado: true },
      { id: 2, nombres: 'Eva', estado: true }
    ] }
  });
  assert.equal(ambiguo.type, CONTACT_TYPES.INTEGRITY_ERROR);
  assert.equal(ambiguo.patient, null);

  const invalido = await identifyWhatsappContact(null, {
    patientModel: { findAll: async () => assert.fail('no debe consultar') }
  });
  assert.equal(invalido.type, CONTACT_TYPES.INVALID_PHONE);
});

test('la unicidad incluye pacientes inactivos', async () => {
  const patientModel = {
    findAll: async () => [{ id: 1, nombres: 'Inactivo', estado: false }]
  };
  const result = await identifyWhatsappContact('62295637', { patientModel });
  assert.equal(result.type, CONTACT_TYPES.EXISTING);
});

test('cada identificacion usa exclusivamente el resultado de su propia consulta', async () => {
  const results = [
    [{ id: 1, nombres: 'Ana', estado: true }],
    []
  ];
  const patientModel = { findAll: async () => results.shift() };
  const existing = await identifyWhatsappContact('62295637', { patientModel });
  const newContact = await identifyWhatsappContact('61111111', { patientModel });
  assert.equal(existing.type, CONTACT_TYPES.EXISTING);
  assert.equal(newContact.type, CONTACT_TYPES.NEW);
});
