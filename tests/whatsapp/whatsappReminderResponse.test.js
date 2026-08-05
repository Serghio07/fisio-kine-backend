const test = require('node:test');
const assert = require('node:assert/strict');
const { processReminderResponse } = require('../../src/services/whatsappReminderResponse.service');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../../src/models/WhatsappConversacion');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const build = (values = {}) => {
  const reminder = {
    id: 11, cita_id: 21, paciente_id: 5, telefono_normalizado: '59160000000',
    cita_fecha: '2026-08-10', cita_hora_inicio: '10:00:00', estado: 'ENTREGADO',
    expira_respuesta_en: new Date('2026-08-08T14:00:00Z'), respondido_en: null,
    async update(data) { Object.assign(this, data); return this; }, ...(values.reminder || {})
  };
  const appointment = {
    id: 21, paciente_id: 5, fecha: '2026-08-10', hora_inicio: '10:00:00', hora_fin: '11:00:00',
    estado: 'Programada', updated_at: '2026-08-01T10:00:00Z', historial_programacion: [],
    async update(data) { Object.assign(this, data); return this; }, ...(values.appointment || {})
  };
  const conversation = {
    id: 3, telefono: '59160000000', paciente_id: 5, tipo_contacto: CONTACT_TYPES.EXISTING,
    paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE,
    contexto: { patient_reference: { id: 5, first_name: 'Sergio' }, appointment_reminder: { reminder_id: 11, appointment_id: 21 } },
    async update(data) { Object.assign(this, data); return this; }, ...(values.conversation || {})
  };
  const args = {
    conversation, reminderModel: { findByPk: async () => reminder },
    appointmentModel: { findOne: async () => appointment }, referralModel: { findOne: async () => null, create: async (data) => ({ id: 1, ...data }) }, transaction,
    activity: { ultimo_mensaje_en: new Date('2026-08-04T14:00:00Z') }, now: new Date('2026-08-04T14:00:00Z')
  };
  return { reminder, appointment, conversation, args };
};

test('confirmar asistencia registra respuesta sin modificar la cita y es idempotente', async () => {
  const data = build();
  const before = data.appointment.estado;
  const result = await processReminderResponse({ ...data.args, message: '1' });
  assert.equal(result.responseKind, 'ATTENDANCE_CONFIRMED');
  assert.match(result.responseText, /Gracias, Sergio/u);
  assert.equal(data.appointment.estado, before);
  assert.equal(data.reminder.respuesta, 'CONFIRMAR_ASISTENCIA');
  assert.equal(data.conversation.paso_actual, CONVERSATION_STEPS.ATTENDANCE_CONFIRMED);
  assert.equal(data.conversation.contexto.appointment_reminder.reminder_id, 11);
  const duplicate = await processReminderResponse({ ...data.args, message: '1' });
  assert.equal(duplicate.responseKind, 'REMINDER_ALREADY_RESPONDED');
  assert.equal(data.appointment.estado, before);
});

test('no asistira exige confirmacion y no cancela inmediatamente', async () => {
  const data = build();
  const result = await processReminderResponse({ ...data.args, message: '2' });
  assert.equal(result.responseKind, 'NONATTENDANCE_CONFIRMATION');
  assert.equal(data.conversation.paso_actual, CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION);
  assert.equal(data.appointment.estado, 'Programada');
  assert.equal(data.reminder.respondido_en, null);
});

test('cancelacion explicita cambia solo la misma cita y conserva historial', async () => {
  const data = build({ conversation: { paso_actual: CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION } });
  const result = await processReminderResponse({ ...data.args, message: '1' });
  assert.equal(result.responseKind, 'REMINDER_APPOINTMENT_CANCELLED');
  assert.equal(data.appointment.estado, 'Cancelada');
  assert.equal(data.appointment.historial_programacion.length, 1);
  assert.equal(data.reminder.respuesta, 'CANCELAR_CITA');
});

test('reprogramar reutiliza el flujo existente sin cambiar fecha ni horario', async () => {
  const data = build();
  const result = await processReminderResponse({ ...data.args, message: '3' });
  assert.equal(result.conversationStep, CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE);
  assert.equal(data.conversation.contexto.appointment_management.appointment_id, 21);
  assert.equal(data.appointment.fecha, '2026-08-10');
  assert.equal(data.appointment.hora_inicio, '10:00:00');
});

test('recepcion no modifica cita y una referencia expirada no procesa opciones', async () => {
  const reception = build();
  const result = await processReminderResponse({ ...reception.args, message: '4' });
  assert.equal(result.responseKind, 'REMINDER_RECEPTION_CREATED');
  assert.equal(reception.appointment.estado, 'Programada');

  const expired = build({ reminder: { expira_respuesta_en: new Date('2026-08-01T00:00:00Z') } });
  const expiredResult = await processReminderResponse({ ...expired.args, message: '1' });
  assert.equal(expiredResult.responseKind, 'REMINDER_EXPIRED');
  assert.equal(expired.reminder.estado, 'EXPIRADO');
  assert.equal(expired.appointment.estado, 'Programada');
});

test('cita modificada o referencia ajena se rechaza sin cambios', async () => {
  const changed = build({ appointment: { hora_inicio: '12:00:00' } });
  assert.equal((await processReminderResponse({ ...changed.args, message: '1' })).responseKind, 'REMINDER_INVALID');
  assert.equal(changed.appointment.estado, 'Programada');
  const foreign = build({ conversation: { telefono: '59161111111' } });
  assert.equal((await processReminderResponse({ ...foreign.args, message: '1' })).responseKind, 'REMINDER_INVALID');
  assert.equal(foreign.appointment.estado, 'Programada');
});
