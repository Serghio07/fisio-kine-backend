const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../../src/config/whatsapp');
const {
  appointmentInstant, boliviaDate, buildReminderKey, classifyError,
  findAppointmentsDueForReminder, createDueReminderRecords, processOneClaimedReminder,
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
  assert.deepEqual(found.map((item) => item.id), [1, 2]);
});

test('crea snapshots independientes para dos hermanos con el mismo tutor', async () => {
  const rows = [
    { id: 10, paciente_id: 2, fecha: '2026-08-05', hora_inicio: '10:00:00', estado: 'Programada', paciente: { id: 2 } },
    { id: 11, paciente_id: 3, fecha: '2026-08-05', hora_inicio: '10:10:00', estado: 'Programada', paciente: { id: 3 } }
  ];
  const created = [];
  const recipientResolver = async () => ({ contactId: 9, normalizedPhone: '59177712345', source: 'CONTACTO', relationship: 'PADRE', recipientName: 'Juan Perez' });
  await createDueReminderRecords({ now: new Date('2026-08-04T14:00:00Z'), appointmentModel: { findAll: async () => rows }, reminderModel: { findOrCreate: async ({ defaults }) => { created.push(defaults); return [defaults, true]; } }, recipientResolver });
  assert.deepEqual(created.map(({ cita_id, paciente_id, contacto_id, telefono_normalizado }) => ({ cita_id, paciente_id, contacto_id, telefono_normalizado })), [
    { cita_id: 10, paciente_id: 2, contacto_id: 9, telefono_normalizado: '59177712345' },
    { cita_id: 11, paciente_id: 3, contacto_id: 9, telefono_normalizado: '59177712345' }
  ]);
  assert.notEqual(created[0].idempotency_key, created[1].idempotency_key);
});

test('crea SIN_DESTINATARIO sin teléfono y continúa con el lote', async () => {
  const rows = [
    { id: 12, paciente_id: 4, fecha: '2026-08-05', hora_inicio: '10:00:00', estado: 'Programada', paciente: { id: 4 } },
    { id: 13, paciente_id: 5, fecha: '2026-08-05', hora_inicio: '10:10:00', estado: 'Programada', paciente: { id: 5 } }
  ];
  const created = [];
  const recipientResolver = async (patient) => patient.id === 4
    ? { normalizedPhone: null, source: 'CONTACTO', reason: 'WHATSAPP_NO_AUTORIZADO' }
    : { normalizedPhone: '59160000000', source: 'PACIENTE', recipientName: 'Ana' };
  await createDueReminderRecords({ now: new Date('2026-08-04T14:00:00Z'), appointmentModel: { findAll: async () => rows }, reminderModel: { findOrCreate: async ({ defaults }) => { created.push(defaults); return [defaults, true]; } }, recipientResolver });
  assert.equal(created[0].estado, 'SIN_DESTINATARIO');
  assert.equal(created[0].telefono_normalizado, null);
  assert.equal(created[0].error_codigo, 'WHATSAPP_NO_AUTORIZADO');
  assert.equal(created[1].estado, 'PENDIENTE');
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

test('recordatorio de tutor menciona al menor y no abre conversación automática', { concurrency: false }, async () => withEnv({
  WHATSAPP_REMINDER_TEMPLATE_NAME: 'recordatorio_cita', WHATSAPP_REMINDER_TEMPLATE_LANGUAGE: 'es'
}, async () => {
  let parameters; let conversations = 0;
  const reminder = {
    id: 81, cita_id: 71, paciente_id: 35, contacto_id: 9, telefono_fuente: 'CONTACTO',
    telefono_normalizado: '59177712345', cita_fecha: '2026-08-06', cita_hora_inicio: '10:00:00', intentos: 1,
    async update(value) { Object.assign(this, value); }
  };
  const patient = { id: 35, nombres: 'Pedro Perez', estado: true, registro_pendiente: false };
  const appointment = { id: 71, paciente_id: 35, fecha: '2026-08-06', hora_inicio: '10:00:00', hora_fin: '11:00:00', estado: 'Programada', paciente: patient };
  const result = await processOneClaimedReminder({
    reminder, now: new Date('2026-08-04T14:00:00Z'), appointmentModel: { findByPk: async () => appointment }, patientModel: {},
    sender: async (phone, template, values) => { parameters = { phone, template, values }; return { success: true, messageId: 'wamid.tutor' }; },
    reminderModel: { findByPk: async () => reminder },
    conversationModel: { findOne: async () => { conversations += 1; return null; }, create: async () => { conversations += 1; } },
    eventModel: { create: async () => ({}) }, db: { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) }
  });
  assert.equal(result, 'accepted');
  assert.equal(parameters.phone, '59177712345');
  assert.equal(parameters.values[0], 'Pedro');
  assert.equal(conversations, 0);
  assert.ok(reminder.expira_respuesta_en instanceof Date);
}));
