const test = require('node:test');
const assert = require('node:assert/strict');
const baseAvailability = require('../../src/services/appointmentAvailability.service');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../../src/models/WhatsappConversacion');
const { finalSummary, processFinalConfirmation } = require('../../src/services/whatsappAppointmentConfirmation.service');

const now = new Date('2026-08-04T14:00:00Z');
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const activity = { ultimo_mensaje_en: now, expira_en: new Date('2026-08-04T14:30:00Z') };
const entity = (values) => ({ async update(data) { Object.assign(this, data); return this; }, ...values });
const request = (values = {}) => entity({ id: 8, paciente_id: 5, cita_id: null, tipo_solicitud: 'AGENDAR', estado: 'PENDIENTE_CONFIRMACION', paso_actual: CONVERSATION_STEPS.SLOT_SELECTED, fecha_solicitada: '2026-08-05', hora_inicio: '15:00', hora_fin: '16:30', motivo: 'Dolor lumbar', datos_temporales: { availability: { selected_slot: { option: 1, date: '2026-08-05', start: '15:00', end: '16:30' } } }, ...values });
const conversation = (values = {}) => entity({ id: 3, telefono: '59160000000', paciente_id: 5, tipo_contacto: CONTACT_TYPES.EXISTING, estado: 'ACTIVA', paso_actual: CONVERSATION_STEPS.SLOT_SELECTED, contexto: { request_id: 8, contact_first_name: 'Sergio' }, ...values });
const models = (item) => ({ requestModel: { findByPk: async (id, options) => { assert.equal(id, 8); assert.equal(options.lock, 'UPDATE'); return item; } }, appointmentModel: { create: async (data) => ({ id: 99, ...data }) }, patientModel: { findByPk: async () => ({ id: 5, estado: true, registro_pendiente: false }) } });
const db = { query: async (sql, options) => { assert.match(sql, /pg_advisory_xact_lock/u); assert.match(options.replacements.slotKey, /^whatsapp-appointment:/u); } };
const availability = { ...baseAvailability, revalidateSlotCapacity: async () => true, getAvailableSlots: async () => ({ date: '2026-08-05', capacity: 3, durationMinutes: 90, intervalMinutes: 30, slots: [{ option: 1, date: '2026-08-05', start: '16:00', end: '17:30' }] }) };
const referralModel = { findOne: async () => null, create: async (data) => ({ id: 1, ...data }) };
const run = (chat, item, message, extra = {}) => processFinalConfirmation({ conversation: chat, message, ...models(item), referralModel, transaction, db, activity, now, availability, ...extra });

test('horario seleccionado muestra resumen final sin crear cita', async () => {
  const item = request(); const chat = conversation(); let creates = 0;
  const result = await run(chat, item, '1', { appointmentModel: { create: async () => { creates += 1; } } });
  assert.equal(creates, 0); assert.equal(result.responseKind, 'FINAL_CONFIRMATION_SUMMARY');
  assert.match(result.responseText, /^Muy bien, Sergio 😊/u); assert.match(result.responseText, /15:00 a 16:30/u);
  assert.doesNotMatch(result.responseText, /paciente_id|cita_id|profesional_id/u);
  assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION);
});

test('paciente existente crea y vincula una unica cita pendiente de origen WhatsApp', async () => {
  const item = request(); const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION }); const created = [];
  const result = await run(chat, item, 'confirmar cita', { appointmentModel: { create: async (data, options) => { created.push(data); assert.equal(options.transaction, transaction); return { id: 99 }; } } });
  assert.equal(created.length, 1); assert.equal(created[0].paciente_id, 5); assert.equal(created[0].estado, 'Pendiente'); assert.equal(created[0].origen, 'WhatsApp');
  assert.equal(created[0].profesional_id, null); assert.equal(created[0].historia_clinica_id, null); assert.equal(created[0].sesion_id, null); assert.equal(created[0].usuario_id, null);
  assert.equal(item.cita_id, 99); assert.equal(item.estado, 'CONFIRMADA'); assert.equal(item.paso_actual, CONVERSATION_STEPS.APPOINTMENT_CREATED);
  assert.equal(chat.paso_actual, CONVERSATION_STEPS.APPOINTMENT_CREATED); assert.equal(result.responseKind, 'APPOINTMENT_CREATED');
});

test('contacto nuevo crea paciente temporal, reserva cita y deriva a recepción', async () => {
  const item = request({ paciente_id: null, nombre_whatsapp: 'María Fernández' }); const chat = conversation({ paciente_id: null, tipo_contacto: CONTACT_TYPES.NEW, paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION }); let creates = 0;
  const temporary = { id: 44, registro_pendiente: true };
  const result = await run(chat, item, '1', { appointmentModel: { create: async () => ({ id: ++creates }) }, patientModel: { findOne: async () => null, create: async (data) => ({ ...temporary, ...data }) } });
  assert.equal(creates, 1); assert.equal(item.estado, 'CONFIRMADA'); assert.equal(item.paciente_id, 44); assert.equal(item.cita_id, 1);
  assert.equal(chat.paso_actual, CONVERSATION_STEPS.APPOINTMENT_CREATED); assert.equal(result.responseKind, 'TEMPORARY_APPOINTMENT_CREATED'); assert.match(result.responseText, /horario quedó reservado/u);
});

test('contacto nuevo conserva id y telefono de una instancia Sequelize al crear la derivacion', async () => {
  const item = request({ paciente_id: null, nombre_whatsapp: 'Ana' });
  const chat = conversation({ paciente_id: null, tipo_contacto: CONTACT_TYPES.NEW, paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION });
  const id = chat.id; const telefono = chat.telefono;
  Object.defineProperty(chat, 'id', { value: id, enumerable: false });
  Object.defineProperty(chat, 'telefono', { value: telefono, enumerable: false });
  let referralData;
  const result = await run(chat, item, '1', {
    appointmentModel: { create: async () => ({ id: 101 }) },
    patientModel: { findOne: async () => null, create: async (data) => ({ id: 45, ...data }) },
    referralModel: { findOne: async () => null, create: async (data) => { referralData = data; return { id: 2, ...data }; } }
  });
  assert.equal(result.responseKind, 'TEMPORARY_APPOINTMENT_CREATED');
  assert.equal(referralData.conversacion_id, id);
  assert.equal(referralData.telefono_normalizado, telefono);
  assert.equal(referralData.paciente_id, 45);
  assert.equal(referralData.cita_id, 101);
});

test('cita vinculada hace la confirmacion idempotente', async () => {
  const item = request({ cita_id: 99, estado: 'CONFIRMADA', paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED }); const chat = conversation({ paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED }); let creates = 0;
  const result = await run(chat, item, '1', { appointmentModel: { create: async () => { creates += 1; } } });
  assert.equal(creates, 0); assert.equal(result.responseKind, 'APPOINTMENT_ALREADY_CREATED');
});

test('capacidad agotada no crea cita y recalcula opciones', async () => {
  const item = request(); const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION }); let creates = 0;
  const result = await run(chat, item, '1', { appointmentModel: { create: async () => { creates += 1; } }, availability: { ...availability, revalidateSlotCapacity: async () => false } });
  assert.equal(creates, 0); assert.equal(result.responseKind, 'AVAILABLE_SLOTS'); assert.equal(item.cita_id, null); assert.equal(item.estado, 'PENDIENTE_CONFIRMACION'); assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
});

test('solicitud inconsistente, paciente inactivo y referencia ausente impiden crear', async () => {
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION }); let creates = 0;
  const invalid = request({ hora_fin: null });
  assert.equal((await run(chat, invalid, '1', { appointmentModel: { create: async () => { creates += 1; } } })).responseKind, 'FINAL_REQUEST_INVALID');
  const inactive = request();
  assert.equal((await run(chat, inactive, '1', { appointmentModel: { create: async () => { creates += 1; } }, patientModel: { findByPk: async () => ({ id: 5, estado: false }) } })).responseKind, 'PATIENT_INVALID');
  const expired = request({ expira_en: new Date('2026-08-04T13:59:59Z') });
  assert.equal((await run(chat, expired, '1', { appointmentModel: { create: async () => { creates += 1; } } })).responseKind, 'FINAL_REQUEST_INVALID');
  const missing = conversation({ contexto: {} });
  assert.equal((await processFinalConfirmation({ conversation: missing, message: '1', requestModel: { findByPk: async () => { throw new Error('no debe buscar'); } }, transaction, db, activity, now, availability })).responseKind, 'FINAL_REQUEST_MISSING');
  assert.equal(creates, 0);
});

test('resumen omite profesional e IDs', () => {
  const text = finalSummary(conversation(), request());
  assert.doesNotMatch(text, /profesional_id|paciente_id|solicitud_id|cita_id/u);
});

test('fallo al crear cita se etiqueta para responder de forma segura y revertir la transaccion', async () => {
  const item = request();
  const chat = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION });
  await assert.rejects(
    run(chat, item, '1', { appointmentModel: { create: async () => { throw new Error('detalle sensible de base de datos'); } } }),
    (error) => error.code === 'WHATSAPP_APPOINTMENT_CREATE_FAILED' && !error.message.includes('detalle sensible')
  );
  assert.equal(item.cita_id, null);
  assert.equal(chat.paso_actual, CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION);
});

test('dos confirmaciones concurrentes serializadas crean una sola cita', async () => {
  let occupied = false; let creates = 0; let queue = Promise.resolve();
  const executeTransaction = (callback) => {
    const previous = queue; let release;
    queue = new Promise((resolve) => { release = resolve; });
    return previous.then(callback).finally(release);
  };
  const concurrentAvailability = {
    ...availability,
    revalidateSlotCapacity: async () => !occupied,
    getAvailableSlots: async () => ({ date: '2026-08-05', capacity: 1, durationMinutes: 90, intervalMinutes: 30, slots: [] })
  };
  const appointmentModel = { create: async (data) => { occupied = true; creates += 1; return { id: creates, ...data }; } };
  const first = request({ id: 81 }); const second = request({ id: 82 });
  const firstChat = conversation({ id: 31, contexto: { request_id: 81 }, paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION });
  const secondChat = conversation({ id: 32, contexto: { request_id: 82 }, paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION });
  const confirm = (chat, item) => executeTransaction(() => processFinalConfirmation({
    conversation: chat, message: '1', requestModel: { findByPk: async () => item }, appointmentModel,
    patientModel: { findByPk: async () => ({ id: 5, estado: true, registro_pendiente: false }) },
    transaction, db, activity, now, availability: concurrentAvailability
  }));
  const results = await Promise.all([confirm(firstChat, first), confirm(secondChat, second)]);
  assert.equal(creates, 1);
  assert.equal(results.filter((result) => result.responseKind === 'APPOINTMENT_CREATED').length, 1);
  assert.equal(results.filter((result) => result.responseKind === 'NO_AVAILABILITY').length, 1);
});
