const test = require('node:test');
const assert = require('node:assert/strict');
const { CONVERSATION_STEPS } = require('../../src/models/WhatsappConversacion');
const { offerAvailability, processAvailabilityStep } = require('../../src/services/whatsappAvailability.service');

const now = new Date('2026-08-04T14:00:00Z');
const activity = { ultimo_mensaje_en: now, expira_en: new Date('2026-08-04T14:30:00Z') };
const entity = (values) => ({ async update(data) { Object.assign(this, data); return this; }, ...values });
const makeRequest = () => entity({ id: 7, tipo_solicitud: 'AGENDAR', estado: 'PENDIENTE_CONFIRMACION', paso_actual: 'SOLICITUD_CREADA', cita_id: null, fecha_solicitada: '2026-08-05', hora_inicio: null, hora_fin: null, datos_temporales: { turno_preferido: 'TARDE' } });
const makeConversation = (step = CONVERSATION_STEPS.REQUEST_CREATED) => entity({ id: 2, paso_actual: step, contexto: { request_id: 7 } });
const slots = [{ option: 1, date: '2026-08-05', start: '15:00', end: '16:30' }];
const availability = { getAvailableSlots: async () => ({ date: '2026-08-05', capacity: 3, durationMinutes: 90, intervalMinutes: 30, slots }), revalidateSlotCapacity: async () => true };
const transaction = { LOCK: { UPDATE: 'UPDATE' } };

test('solicitud creada guarda opciones y avanza sin crear cita ni solicitud', async () => {
  const request = makeRequest(); const conversation = makeConversation();
  const result = await offerAvailability({ conversation, request, transaction, activity, now, availability });
  assert.equal(result.responseKind, 'AVAILABLE_SLOTS');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
  assert.equal(request.paso_actual, CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
  assert.equal(request.datos_temporales.availability.slots.length, 1);
  assert.equal(request.datos_temporales.availability.selected_slot, null);
  assert.equal(Object.hasOwn(request.datos_temporales, 'profesional_id'), false);
});

test('seleccion vigente revalida y actualiza la solicitud existente', async () => {
  const request = makeRequest(); const conversation = makeConversation();
  await offerAvailability({ conversation, request, transaction, activity, now, availability });
  let revalidations = 0;
  const result = await processAvailabilityStep({ conversation, message: '1', requestModel: { findByPk: async (id, options) => { assert.equal(id, 7); assert.equal(options.lock, 'UPDATE'); return request; } }, transaction, activity, now, availability: { ...availability, revalidateSlotCapacity: async () => { revalidations += 1; return true; } } });
  assert.equal(revalidations, 1); assert.equal(result.responseKind, 'FINAL_CONFIRMATION_SUMMARY');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION);
  assert.equal(request.hora_inicio, '15:00'); assert.equal(request.hora_fin, '16:30');
  assert.equal(request.estado, 'PENDIENTE_CONFIRMACION'); assert.equal(request.cita_id, null);
  assert.equal(request.paso_actual, CONVERSATION_STEPS.SLOT_SELECTED);
});

test('opcion expirada recalcula y capacidad agotada no guarda horario', async () => {
  const request = makeRequest(); const conversation = makeConversation(CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
  request.datos_temporales.availability = { expires_at: '2026-08-04T13:59:00Z', slots };
  let searches = 0;
  const api = { ...availability, getAvailableSlots: async () => { searches += 1; return availability.getAvailableSlots(); } };
  await processAvailabilityStep({ conversation, message: '1', requestModel: { findByPk: async () => request }, transaction, activity, now, availability: api });
  assert.equal(searches, 1); assert.equal(request.hora_inicio, null);
  request.datos_temporales.availability.expires_at = '2026-08-04T14:15:00Z';
  const occupied = await processAvailabilityStep({ conversation, message: '1', requestModel: { findByPk: async () => request }, transaction, activity, now, availability: { ...api, revalidateSlotCapacity: async () => false } });
  assert.notEqual(occupied.responseKind, 'SLOT_SELECTED'); assert.equal(request.hora_inicio, null);
});

test('solicitud ausente no busca por telefono', async () => {
  const conversation = entity({ paso_actual: CONVERSATION_STEPS.REQUEST_CREATED, contexto: {} });
  const result = await processAvailabilityStep({ conversation, message: '1', requestModel: { findByPk: async () => { throw new Error('no debe ejecutarse'); } }, transaction, activity, now, availability });
  assert.equal(result.responseKind, 'AVAILABILITY_REQUEST_MISSING');
});
