const test = require('node:test');
const assert = require('node:assert/strict');
const { processInternalAppointmentReminders, scheduleToken } = require('../src/services/internalAppointmentReminder.service');
const { runCycle } = require('../src/jobs/internalAppointmentReminder.job');

const appointment = (changes = {}) => ({
  id: 41,
  fecha: '2026-08-16',
  hora_inicio: '10:05:00',
  estado: 'Confirmada',
  paciente: { id: 7, nombres: 'ANA MARÍA', apellidos: 'PÉREZ ROJAS' },
  ...changes
});

test('crea el aviso de cinco minutos para todos los usuarios de agenda', async () => {
  let query;
  let payload;
  const item = appointment();
  const result = await processInternalAppointmentReminders({
    now: new Date('2026-08-16T14:00:20Z'),
    appointmentModel: { findAll: async (value) => { query = value; return [item]; } },
    userModel: { findAll: async () => [{ id: 2 }, { id: 5 }] },
    notificationService: { createForUsers: async (value) => { payload = value; return [{ created: true }, { created: true }]; } }
  });
  assert.deepEqual(payload.userIds, [2, 5]);
  assert.equal(payload.type, 'CITA_PROXIMA');
  assert.equal(payload.entityType, 'CITA_AGENDA');
  assert.equal(payload.message, 'La cita del paciente ANA MARÍA PÉREZ ROJAS comienza en 5 minutos.');
  assert.equal(payload.idempotencyKey(2), `appointment-five-minutes:41:${scheduleToken(item)}:2`);
  assert.equal(result.created, 2);
  assert.ok(query.where.estado);
});

test('no envía si la cita fue cancelada al volver a verificarla', async () => {
  let notifications = 0;
  const item = appointment({ reload: async function () { this.estado = 'Cancelada'; return this; } });
  const result = await processInternalAppointmentReminders({
    now: new Date('2026-08-16T14:00:20Z'),
    appointmentModel: { findAll: async () => [item] },
    userModel: { findAll: async () => [{ id: 2 }] },
    notificationService: { createForUsers: async () => { notifications += 1; return []; } }
  });
  assert.equal(notifications, 0);
  assert.equal(result.created, 0);
});

test('una nueva hora produce otra clave y evita duplicados para el mismo horario', () => {
  const original = appointment();
  const changed = appointment({ hora_inicio: '11:05:00' });
  assert.notEqual(scheduleToken(original), scheduleToken(changed));
  assert.equal(scheduleToken(original), scheduleToken(appointment()));
});

test('la guardia evita ejecutar dos ciclos simultáneos', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = runCycle(async () => pending);
  const second = await runCycle(async () => assert.fail());
  assert.equal(second.skipped, true);
  release({ ok: true });
  await first;
});
