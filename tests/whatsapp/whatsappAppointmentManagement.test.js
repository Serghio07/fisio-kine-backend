const test = require('node:test');
const assert = require('node:assert/strict');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../../src/models/WhatsappConversacion');
const availabilityBase = require('../../src/services/appointmentAvailability.service');
const { isFuture, buildListMessage, processManagementStep } = require('../../src/services/whatsappAppointmentManagement.service');

const now = new Date('2026-08-04T14:00:00Z'); // 10:00 America/La_Paz
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const activity = { ultimo_mensaje_en: now, expira_en: new Date('2026-08-04T14:30:00Z') };
const entity = (values) => ({ async update(data, options) { assert.equal(options.transaction, transaction); Object.assign(this, data); return this; }, ...values });
const appointment = (values = {}) => entity({ id: 20, paciente_id: 5, fecha: '2026-08-05', hora_inicio: '15:00', hora_fin: '16:00', estado: 'Pendiente', profesional_id: 7, historia_clinica_id: null, sesion_id: null, origen: 'WhatsApp', historial_programacion: [], fecha_programada_original: null, hora_inicio_original: null, hora_fin_original: null, updated_at: new Date('2026-08-04T12:00:00Z'), ...values });
const conversation = (values = {}) => entity({ id: 3, telefono: '59160000000', paciente_id: 5, tipo_contacto: CONTACT_TYPES.EXISTING, paso_actual: CONVERSATION_STEPS.START_APPOINTMENTS, contexto: { patient_reference: { id: 5, first_name: 'Sergio' }, contact_first_name: 'Sergio' }, ...values });
const db = { query: async (sql, options) => { assert.match(sql, /pg_advisory_xact_lock/u); assert.match(options.replacements.slotKey, /^whatsapp-appointment:/u); } };
const availability = { ...availabilityBase, getAvailableSlots: async ({ date, durationMinutes, excludeAppointmentId }) => { assert.equal(durationMinutes, 60); assert.equal(excludeAppointmentId, 20); return { slots: [{ option: 1, date, start: '16:00', end: '17:00' }] }; }, revalidateSlotCapacity: async ({ excludeAppointmentId }) => { assert.equal(excludeAppointmentId, 20); return true; } };
const modelFor = (items) => ({
  findAll: async (options) => { assert.deepEqual(options.attributes.includes('motivo'), false); return items; },
  findOne: async (options) => items.find((item) => item.id === options.where.id && item.paciente_id === options.where.paciente_id) || null
});
const run = (chat, message, items, extra = {}) => processManagementStep({ conversation: chat, message, appointmentModel: modelFor(items), patientModel: { findByPk: async () => ({ id: 5, estado: true, registro_pendiente: false }) }, referralModel: { findOne: async () => null, create: async (data) => ({ id: 1, ...data }) }, transaction, db, activity, now, availability, ...extra });

test('regla futura usa America La Paz y excluye citas iniciadas', () => {
  assert.equal(isFuture(appointment({ fecha: '2026-08-04', hora_inicio: '10:01' }), now), true);
  assert.equal(isFuture(appointment({ fecha: '2026-08-04', hora_inicio: '10:00' }), now), false);
  assert.equal(isFuture(appointment({ fecha: '2026-08-03' }), now), false);
});

test('listado seguro muestra fecha y hora pero no IDs ni datos clinicos', async () => {
  const item = appointment(); const other = appointment({ id: 21, fecha: '2026-08-06' }); const chat = conversation();
  const result = await run(chat, '2', [item, other]);
  assert.equal(result.responseKind, 'APPOINTMENT_LIST');
  assert.match(result.responseText, /Sergio/u); assert.match(result.responseText, /15:00 a 16:00/u);
  assert.doesNotMatch(result.responseText, /appointment_id|cita_id|motivo|profesional|historia|paciente_id/iu);
  assert.equal(chat.contexto.appointment_management.appointments.length, 2);
});

test('contacto nuevo no consulta citas', async () => {
  const chat = conversation({ paciente_id: null, tipo_contacto: CONTACT_TYPES.NEW }); let queries = 0;
  const result = await run(chat, '2', [], { appointmentModel: { findAll: async () => { queries += 1; } }, patientModel: { findByPk: async () => null } });
  assert.equal(queries, 0); assert.equal(result.responseKind, 'MANAGEMENT_NOT_PATIENT');
});

test('seleccion reconsulta propiedad y muestra detalle minimo', async () => {
  const item = appointment(); const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, contexto: { contact_first_name: 'Sergio', appointment_management: { mode: 'MANAGE', expires_at: '2026-08-04T14:15:00Z', appointments: [{ option: 1, appointment_id: 20 }] } } });
  const result = await run(chat, '1', [item]);
  assert.equal(result.responseKind, 'APPOINTMENT_DETAIL'); assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION);
  assert.doesNotMatch(result.responseText, /appointment_id|cita_id|profesional|motivo/iu);
});

test('lista expirada se vuelve a consultar', async () => {
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, contexto: { appointment_management: { mode: 'CONSULT', expires_at: '2026-08-04T13:59:00Z', appointments: [] } } });
  const result = await run(chat, '1', [appointment(), appointment({ id: 21, fecha: '2026-08-06' })]);
  assert.equal(result.responseKind, 'APPOINTMENT_LIST'); assert.ok(new Date(chat.contexto.appointment_management.expires_at) > now);
});

test('cancelacion exige confirmacion y actualiza la misma cita una sola vez', async () => {
  const item = appointment(); const original = { date: item.fecha, start: '15:00', end: '16:00', status: item.estado, updated_at: item.updated_at.toISOString() };
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION, contexto: { appointment_management: { mode: 'MANAGE', appointment_id: 20, original_slot: original } } });
  const invalid = await run(chat, 'cancelar', [item]); assert.equal(invalid.responseKind, 'INVALID_OPTION'); assert.equal(item.estado, 'Pendiente');
  const result = await run(chat, '1', [item]); assert.equal(result.responseKind, 'APPOINTMENT_CANCELLED'); assert.equal(item.estado, 'Cancelada'); assert.equal(item.id, 20); assert.equal(item.historial_programacion.length, 1);
});

test('reprogramacion conserva duracion y no modifica antes de confirmar', async () => {
  const item = appointment(); const original = { date: item.fecha, start: '15:00', end: '16:00', status: item.estado, updated_at: item.updated_at.toISOString() };
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, contexto: { appointment_management: { mode: 'RESCHEDULE', appointment_id: 20, original_slot: original } } });
  const result = await run(chat, '08/08/2026', [item]);
  assert.equal(result.responseKind, 'RESCHEDULE_SLOTS'); assert.equal(item.fecha, '2026-08-05'); assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT);
});

test('confirmar reprogramacion actualiza misma fila y conserva relaciones y estado', async () => {
  const item = appointment(); const original = { date: item.fecha, start: '15:00', end: '16:00', status: item.estado, updated_at: item.updated_at.toISOString() };
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION, contexto: { appointment_management: { mode: 'RESCHEDULE', appointment_id: 20, original_slot: original, candidate_date: '2026-08-08', candidate_slot: { date: '2026-08-08', start: '09:00', end: '10:00' } } } });
  const result = await run(chat, '1', [item]);
  assert.equal(result.responseKind, 'APPOINTMENT_RESCHEDULED'); assert.equal(item.id, 20); assert.equal(item.fecha, '2026-08-08'); assert.equal(item.hora_inicio, '09:00'); assert.equal(item.hora_fin, '10:00');
  assert.equal(item.paciente_id, 5); assert.equal(item.profesional_id, 7); assert.equal(item.estado, 'Pendiente'); assert.equal(item.historial_programacion.length, 1);
});

test('cambio concurrente y capacidad agotada conservan cita original', async () => {
  const changed = appointment({ updated_at: new Date('2026-08-04T13:00:00Z') }); const original = { date: changed.fecha, start: '15:00', end: '16:00', status: changed.estado, updated_at: '2026-08-04T12:00:00.000Z' };
  const context = { appointment_management: { mode: 'RESCHEDULE', appointment_id: 20, original_slot: original, candidate_date: '2026-08-08', candidate_slot: { date: '2026-08-08', start: '09:00', end: '10:00' } } };
  assert.equal((await run(conversation({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION, contexto: context }), '1', [changed])).responseKind, 'APPOINTMENT_CHANGED');
  const item = appointment(); const validOriginal = { ...original, updated_at: item.updated_at.toISOString() };
  const result = await run(conversation({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION, contexto: { appointment_management: { ...context.appointment_management, original_slot: validOriginal } } }), '1', [item], { availability: { ...availability, revalidateSlotCapacity: async () => false } });
  assert.equal(result.responseKind, 'RESCHEDULE_SLOTS'); assert.equal(item.fecha, '2026-08-05');
});

test('hora fin ausente deriva reprogramacion sin inventar duracion', async () => {
  const item = appointment({ hora_fin: null });
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION, contexto: { appointment_management: { mode: 'MANAGE', appointment_id: 20 } } });
  const result = await run(chat, '1', [item]); assert.equal(result.responseKind, 'RESCHEDULE_REFERRED'); assert.equal(item.fecha, '2026-08-05');
});

test('mensaje de lista puro tampoco muestra campos privados', () => {
  const text = buildListMessage(conversation(), [appointment({ motivo: 'dato privado' })], 'CONSULT');
  assert.doesNotMatch(text, /dato privado|motivo|profesional|paciente_id/iu);
});

test('sin citas ofrece agendar o volver sin crear solicitud ni modificar citas', async () => {
  const chat = conversation();
  const listed = await run(chat, '2', []);
  assert.match(listed.responseText, /1\. Sí, agendar/u);
  assert.match(listed.responseText, /2\. Volver al menú/u);
  assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION);

  const back = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, contexto: chat.contexto });
  assert.equal((await run(back, '2', [])).goToMenu, true);

  const booking = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, contexto: chat.contexto });
  const result = await run(booking, '1', []);
  assert.equal(result.responseKind, 'BOOKING_STARTED');
  assert.equal(booking.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
  assert.equal(booking.contexto.request_id, undefined);
});
