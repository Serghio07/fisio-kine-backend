const test = require('node:test');
const assert = require('node:assert/strict');
const { appointmentStateForAttendance, ensureNoShowSession, findAndLockAppointmentForSession, reconcileAttendedAppointments } = require('../src/services/citaSesionLink.service');

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

test('vincula por fecha cuando una numeración histórica está desfasada', async () => {
  const calls = [];
  const fallback = { id: 14, numero_sesion: 3, estado: 'Programada' };
  const appointmentModel = { findOne: async (options) => { calls.push(options.where); return calls.length === 1 ? null : fallback; } };
  const result = await findAndLockAppointmentForSession({ paciente_id: 4, historia_clinica_id: 5, fecha: '2026-08-14', numero_sesion: 2 }, { transaction: { LOCK: { UPDATE: 'UPDATE' } }, appointmentModel });
  assert.equal(result, fallback);
  assert.equal(calls[0].numero_sesion, 2);
  assert.equal(calls[1].numero_sesion, undefined);
});

test('repara una cita programada que ya tiene una sesión asistida', async () => {
  let updated;
  const appointment = { id: 63, paciente_id: 7, historia_clinica_id: 4, fecha: '2026-08-14', numero_sesion: 9, update: async (value) => { updated = value; } };
  let appointmentReads = 0;
  const appointmentModel = { findAll: async () => (++appointmentReads === 1 ? [appointment] : []) };
  const sessionModel = { findAll: async () => [{ id: 91, paciente_id: 7, historia_clinica_id: 4, fecha: '2026-08-14', numero_sesion: 9, asistencia: 'asistio', anulada: false }] };
  const db = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) };
  const repaired = await reconcileAttendedAppointments({ db, appointmentModel, sessionModel });
  assert.equal(repaired, 1);
  assert.deepEqual(updated, { sesion_id: 91, estado: 'Atendida' });
});

test('corrige una inasistencia automática cuando ya existía atención y conserva trazabilidad', async () => {
  let appointmentUpdate; let noShowUpdate;
  const appointment = { id: 78, paciente_id: 8, historia_clinica_id: 12, fecha: '2026-08-14', numero_sesion: 14, estado: 'No asistio', sesion_id: 200, update: async (value) => { appointmentUpdate = value; } };
  let appointmentReads = 0;
  const appointmentModel = {
    findAll: async () => (++appointmentReads === 1 ? [appointment] : [{ sesion_id: 200 }])
  };
  const attended = { id: 140, paciente_id: 8, historia_clinica_id: 12, fecha: '2026-08-14', numero_sesion: 14, asistencia: 'asistio', anulada: false };
  const sessionModel = {
    findAll: async () => [attended],
    findByPk: async () => ({ id: 200, asistencia: 'no_asistio', anulada: false, update: async (value) => { noShowUpdate = value; } })
  };
  const db = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) };
  const repaired = await reconcileAttendedAppointments({ db, appointmentModel, sessionModel });
  assert.equal(repaired, 1);
  assert.deepEqual(appointmentUpdate, { sesion_id: 140, estado: 'Atendida' });
  assert.equal(noShowUpdate.anulada, true);
  assert.match(noShowUpdate.observacion_anulacion, /prevalece la atención/i);
});
