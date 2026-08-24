const test = require('node:test');
const assert = require('node:assert/strict');
const Paciente = require('../../src/models/Paciente');
const { normalizarPaciente, validarPaciente, validarDocumentoUnico } = require('../../src/controllers/paciente.controller');
const { normalizePatientDocument, patientDocumentLabel } = require('../../src/utils/patientDocument');

test('paciente antiguo conserva compatibilidad como CI', () => {
  const data = normalizarPaciente({ ci: '12345678' });
  assert.equal(data.tipo_documento, 'CI');
  assert.equal(data.numero_documento, '12345678');
  assert.equal(data.numero_documento_normalizado, '12345678');
  assert.equal(data.ci, '12345678');
  assert.equal(patientDocumentLabel({ ci: '12345678' }), 'CI 12345678');
});

test('normaliza documentos alfanumericos sin eliminar separadores validos', () => {
  assert.equal(normalizePatientDocument('  ab-12 / 34  '), 'AB-12 / 34');
  const passport = normalizarPaciente({ tipo_documento: 'PASAPORTE', numero_documento: ' ab1234567 ' });
  assert.deepEqual({ ci: passport.ci, numero: passport.numero_documento, normalizado: passport.numero_documento_normalizado }, { ci: null, numero: 'ab1234567', normalizado: 'AB1234567' });
  assert.equal(validarPaciente({ nombres: 'ANA', apellidos: 'PEREZ', ...passport, telefono: '70000000', sexo: 'FEMENINO' }), null);
});

test('CI sigue siendo numerico y OTRO exige nombre', () => {
  assert.match(validarPaciente({ nombres: 'ANA', apellidos: 'PEREZ', tipo_documento: 'CI', numero_documento: 'AB12', telefono: '70000000', sexo: 'FEMENINO' }), /solo puede contener números/);
  assert.match(validarPaciente({ nombres: 'ANA', apellidos: 'PEREZ', tipo_documento: 'OTRO', numero_documento: 'CD-A1', telefono: '70000000', sexo: 'FEMENINO' }), /nombre del documento/);
});

test('unicidad combina tipo y numero normalizado y excluye el ID editado', async () => {
  const original = Paciente.findOne;
  let query;
  Paciente.findOne = async (options) => { query = options; return null; };
  try {
    assert.equal(await validarDocumentoUnico('PASAPORTE', 'AB123', 9), true);
    assert.equal(query.where.tipo_documento, 'PASAPORTE');
    assert.equal(query.where.numero_documento_normalizado, 'AB123');
    assert.ok(query.where.id);
  } finally { Paciente.findOne = original; }
});

test('CI y PASAPORTE con el mismo numero pertenecen a claves documentales distintas', async () => {
  const original = Paciente.findOne;
  const seen = [];
  Paciente.findOne = async ({ where }) => { seen.push(where); return null; };
  try {
    await validarDocumentoUnico('CI', '12345678');
    await validarDocumentoUnico('PASAPORTE', '12345678');
    assert.notEqual(seen[0].tipo_documento, seen[1].tipo_documento);
  } finally { Paciente.findOne = original; }
});
