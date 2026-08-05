const test = require('node:test');
const assert = require('node:assert/strict');
const { appointmentStateForAttendance, ensureNoShowSession } = require('../src/services/citaSesionLink.service');

test('mapea asistencia al estado de cita', () => {
  assert.equal(appointmentStateForAttendance('asistio', 'Programada'), 'Atendida');
  assert.equal(appointmentStateForAttendance('no_asistio', 'Programada'), 'No asistio');
  assert.equal(appointmentStateForAttendance('reprogramada', 'Programada'), 'Reprogramada');
});

test('crea sesión mínima y vincula una inasistencia', async () => {
  let created; let updated;
  const appointment = { id: 12, estado: 'No asistio', sesion_id: null, paciente_id: 4, historia_clinica_id: 5, fecha: '2026-08-01', numero_sesion: 5, profesional_id: 1, update: async (value) => { updated = value; Object.assign(appointment, value); } };
  const sessionModel = { findOne: async () => null, create: async (value) => { created = { id: 33, ...value }; return created; } };
  const result = await ensureNoShowSession(appointment, { transaction: { LOCK: { UPDATE: 'UPDATE' } }, sessionModel, appointmentModel: { findOne: async () => null } });
  assert.equal(result.asistencia, 'no_asistio');
  assert.equal(created.estado_pago, 'Sin costo');
  assert.deepEqual(updated, { sesion_id: 33, estado: 'No asistio' });
});

test('reutiliza vínculo existente sin crear duplicado', async () => {
  let creates = 0;
  const result = await ensureNoShowSession({ estado: 'Falto', sesion_id: 9 }, { sessionModel: { findByPk: async (id) => ({ id }), create: async () => { creates += 1; } } });
  assert.equal(result.id, 9);
  assert.equal(creates, 0);
});
