const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../../src/config/whatsapp');
const {
  appointmentInstant, boliviaDate, buildReminderKey, classifyError,
  findAppointmentsDueForReminder, processOneClaimedReminder,
  processDueAppointmentReminders
} = require('../../src/services/appointmentReminder.service');
const { sendTemplateMessage } = require('../../src/services/whatsapp.service');

const withEnv = async (values, callback) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) { previous[key] = process.env[key]; if (value == null) delete process.env[key]; else process.env[key] = value; }
  try { return await callback(); } finally { for (const [key, value] of Object.entries(previous)) { if (value == null) delete process.env[key]; else process.env[key] = value; } }
};

test('recordatorios quedan desactivados por defecto y usan limites seguros', { concurrency: false }, async () => withEnv({
  WHATSAPP_REMINDERS_ENABLED: null, WHATSAPP_REMINDER_HOURS_BEFORE: null,
  WHATSAPP_REMINDER_WINDOW_MINUTES: null, WHATSAPP_REMINDER_MAX_ATTEMPTS: null
}, async () => {
  assert.equal(config.getWhatsappRemindersEnabled(), false);
  assert.equal(config.getWhatsappReminderHoursBefore(), 24);
  assert.equal(config.getWhatsappReminderWindowMinutes(), 30);
  assert.equal(config.getWhatsappReminderMaxAttempts(), 3);
  assert.deepEqual(await processDueAppointmentReminders(), { disabled: true, processed: 0 });
}));

test('fecha e instante se calculan expresamente en America La Paz', () => {
  assert.equal(appointmentInstant({ fecha: '2026-08-05', hora_inicio: '10:30:00' }).toISOString(), '2026-08-05T14:30:00.000Z');
  assert.equal(boliviaDate(new Date('2026-08-05T02:00:00Z')), '2026-08-04');
  assert.equal(buildReminderKey(9, new Date('2026-08-04T14:30:00Z')), 'appointment-reminder:9:CITA_PROXIMA:2026-08-04T14:30:00.000Z');
});

test('solo selecciona citas futuras elegibles con telefono normalizado', async () => {
  const rows = [
    { id: 1, paciente_id: 2, fecha: '2026-08-05', hora_inicio: '10:00:00', estado: 'Programada', paciente: { telefono_normalizado: '59160000000' } },
    { id: 2, paciente_id: 2, fecha: '2026-08-05', hora_inicio: '10:00:00', estado: 'Programada', paciente: { telefono_normalizado: null } }
  ];
  const model = { findAll: async (query) => { assert.ok(query.where.estado); return rows; } };
  const found = await findAppointmentsDueForReminder({ now: new Date('2026-08-04T14:00:00Z'), appointmentModel: model });
  assert.deepEqual(found.map((item) => item.id), [1]);
});

test('clasifica fallos transitorios y permanentes', () => {
  assert.equal(classifyError({ code: 'TIMEOUT' }), 'TRANSITORIO');
  assert.equal(classifyError({ status: 429 }), 'TRANSITORIO');
  assert.equal(classifyError({ status: 400, code: 131026 }), 'PERMANENTE');
});

test('envia plantilla con parametros y no expone token', async () => {
  let request;
  const result = await sendTemplateMessage('59160000000', { name: 'recordatorio_cita', language: 'es' }, ['Ana', '5 de agosto', '10:00'], {
    config: { enabled: true, accessToken: 'secreto', phoneNumberId: '123', apiVersion: 'v26.0' },
    fetchImplementation: async (url, options) => { request = { url, options }; return { ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.1' }] }) }; }
  });
  assert.equal(result.success, true);
  const body = JSON.parse(request.options.body);
  assert.equal(body.type, 'template');
  assert.equal(body.template.name, 'recordatorio_cita');
  assert.deepEqual(body.template.components[0].parameters.map((item) => item.text), ['Ana', '5 de agosto', '10:00']);
  assert.equal(JSON.stringify(body).includes('secreto'), false);
});

test('plantilla ausente bloquea el envio antes de llamar Meta', { concurrency: false }, async () => withEnv({
  WHATSAPP_REMINDER_TEMPLATE_NAME: null, WHATSAPP_REMINDER_TEMPLATE_LANGUAGE: null
}, async () => {
  let sent = 0;
  const reminder = { cita_id: 7, paciente_id: 3, telefono_normalizado: '59160000000', cita_fecha: '2026-08-06', cita_hora_inicio: '10:00:00', intentos: 1, async update(value) { Object.assign(this, value); } };
  const patient = { id: 3, nombres: 'Ana Pérez', telefono_normalizado: '59160000000', estado: true, registro_pendiente: false };
  const appointment = { id: 7, paciente_id: 3, fecha: '2026-08-06', hora_inicio: '10:00:00', hora_fin: '11:00:00', estado: 'Programada', paciente: patient };
  const result = await processOneClaimedReminder({ reminder, now: new Date('2026-08-04T14:00:00Z'), appointmentModel: { findByPk: async () => appointment }, patientModel: {}, sender: async () => { sent += 1; } });
  assert.equal(result, 'configuration_error');
  assert.equal(reminder.estado, 'FALLIDO');
  assert.equal(reminder.error_codigo, 'TEMPLATE_NOT_CONFIGURED');
  assert.equal(sent, 0);
}));
