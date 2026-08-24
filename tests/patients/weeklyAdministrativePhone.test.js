const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWeeklyAdministrativePhone } = require('../../src/services/sesionSemanalSync.service');

test('snapshot semanal usa teléfono administrativo de adulto', async () => {
  const patient = { id: 1, telefono: '77712345', fecha_nacimiento: '1990-01-01' };
  const result = await resolveWeeklyAdministrativePhone(patient, {
    resolver: async () => ({ telefono: patient.telefono, fuente: 'PACIENTE' })
  });
  assert.equal(result, '77712345');
});

test('snapshot semanal de menor usa tutor aunque tenga teléfono personal', async () => {
  const patient = { id: 2, telefono: '76543210', fecha_nacimiento: '2016-01-01' };
  const result = await resolveWeeklyAdministrativePhone(patient, {
    resolver: async () => ({ telefono: '77712345', fuente: 'CONTACTO' })
  });
  assert.equal(result, '77712345');
  assert.equal(patient.telefono, '76543210');
});

test('snapshot semanal queda null si menor no tiene tutor válido', async () => {
  assert.equal(await resolveWeeklyAdministrativePhone(
    { id: 3, telefono: '76543210', fecha_nacimiento: '2016-01-01' },
    { resolver: async () => null }
  ), null);
});
