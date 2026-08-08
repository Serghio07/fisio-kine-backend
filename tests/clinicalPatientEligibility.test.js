const test = require('node:test');
const assert = require('node:assert/strict');
const { clinicalPatientEligibilityError } = require('../src/services/clinicalPatientEligibility.service');

test('permite únicamente paciente activo y definitivo', () => {
  assert.equal(clinicalPatientEligibilityError({ estado: true, registro_pendiente: false }), null);
});

test('rechaza paciente temporal aunque siga activo', () => {
  const error = clinicalPatientEligibilityError({ estado: true, registro_pendiente: true });
  assert.equal(error.status, 409);
  assert.match(error.message, /temporal/);
});

test('rechaza paciente inactivo y paciente inexistente', () => {
  assert.equal(clinicalPatientEligibilityError({ estado: false, registro_pendiente: false }).status, 409);
  assert.equal(clinicalPatientEligibilityError(null).status, 404);
});
