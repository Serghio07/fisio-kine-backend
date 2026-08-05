const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MESSAGES, sanitizeFirstName, validateContactName, validateAppointmentReason, parsePreferredDate,
  parsePreferredTime, buildSummary, processAppointmentStep
} = require('../../src/services/whatsappAppointmentRequest.service');
const { CONVERSATION_STATUS, CONVERSATION_STEPS, CONTACT_TYPES } = require('../../src/models/WhatsappConversacion');

const activity = { ultimo_mensaje_en: new Date('2026-08-04T14:00:00Z'), expira_en: new Date('2026-08-04T14:30:00Z') };
const makeConversation = (values = {}) => ({
  id: 20, telefono: '59160000000', paciente_id: 5,
  tipo_contacto: CONTACT_TYPES.EXISTING, estado: CONVERSATION_STATUS.ACTIVE,
  paso_actual: CONVERSATION_STEPS.WAITING_REASON, contexto: {},
  async update(data) { Object.assign(this, data); return this; },
  ...values
});
const process = (conversation, message, requestModel = { create: async () => ({ id: 1 }) }) => processAppointmentStep({
  conversation, message, requestModel, transaction: {}, activity
});

test('valida nombres sin usar perfil ni permitir URL o numeros', () => {
  for (const name of ['María', 'Ana María', "Jean-Pierre O'Connor"]) assert.equal(validateContactName(name).valid, true);
  for (const name of ['', 'A', 'https://ejemplo.com', 'María 70000000', '😀']) assert.equal(validateContactName(name).valid, false);
});

test('sanea espacios, conserva tildes y limita el primer nombre', () => {
  assert.equal(sanitizeFirstName('   María    Fernanda   '), 'María');
  assert.equal(sanitizeFirstName(`Á${'a'.repeat(60)} Apellido`).length, 50);
});

test('valida motivo sin interpretarlo clinicamente', () => {
  assert.deepEqual(validateAppointmentReason(' Dolor de rodilla al caminar '), { valid: true, value: 'Dolor de rodilla al caminar' });
  for (const reason of ['12345', '😀😀😀😀😀', 'web https://x.com', 'abc', 'x'.repeat(501)]) assert.equal(validateAppointmentReason(reason).valid, false);
});

test('parsea fechas controladas en zona de Bolivia', () => {
  const options = { now: new Date('2026-08-04T03:00:00Z'), timeZone: 'America/La_Paz', maxDays: 90 };
  assert.equal(parsePreferredDate('05/08/2026', options).value, '2026-08-05');
  assert.equal(parsePreferredDate('2026-08-08', options).value, '2026-08-08');
  assert.equal(parsePreferredDate('mañana', options).value, '2026-08-04');
  assert.equal(parsePreferredDate('pasado mañana', options).value, '2026-08-05');
  assert.equal(parsePreferredDate('próximo lunes', options).value, '2026-08-10');
  assert.equal(parsePreferredDate('01/08/2026', options).error, 'PAST');
  assert.equal(parsePreferredDate('09/08/2026', options).error, 'SUNDAY');
  assert.equal(parsePreferredDate('enero tal vez', options).error, 'INVALID');
  assert.equal(parsePreferredDate('01/12/2026', options).error, 'TOO_FAR');
});

test('parsea horas y respeta jornada y sabado', () => {
  assert.deepEqual(parsePreferredTime('9 am'), { valid: true, value: '09:00' });
  assert.deepEqual(parsePreferredTime('15:00'), { valid: true, value: '15:00' });
  assert.equal(parsePreferredTime('13:00').valid, false);
  assert.equal(parsePreferredTime('20:00').valid, false);
  assert.equal(parsePreferredTime('3 pm', true).valid, false);
  assert.equal(parsePreferredTime('10:15', true).valid, true);
});

test('flujo nuevo guarda nombre temporal y luego motivo', async () => {
  const conversation = makeConversation({ tipo_contacto: CONTACT_TYPES.NEW, paciente_id: null, paso_actual: CONVERSATION_STEPS.WAITING_NAME });
  const nameResult = await process(conversation, 'María Fernández');
  assert.equal(conversation.contexto.appointment_request.contact_name, 'María Fernández');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
  assert.match(nameResult.responseText, /^Gracias, María\./u);
  await process(conversation, 'Dolor de espalda al caminar');
  assert.equal(conversation.contexto.appointment_request.reason, 'Dolor de espalda al caminar');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_DATE);
});

test('datos invalidos no avanzan el paso', async () => {
  const name = makeConversation({ tipo_contacto: CONTACT_TYPES.NEW, paso_actual: CONVERSATION_STEPS.WAITING_NAME });
  assert.equal((await process(name, 'A')).responseText, MESSAGES.INVALID_NAME);
  assert.equal(name.paso_actual, CONVERSATION_STEPS.WAITING_NAME);
  const reason = makeConversation();
  assert.equal((await process(reason, '123')).responseText, MESSAGES.INVALID_REASON);
  assert.equal(reason.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
});

test('fecha, turno y hora conducen al resumen sin reservar', async () => {
  const conversation = makeConversation({
    paso_actual: CONVERSATION_STEPS.WAITING_DATE,
    contexto: { appointment_request: { reason: 'Dolor de rodilla' } }
  });
  await process(conversation, '08/08/2026');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_SHIFT);
  const invalidAfternoon = await process(conversation, 'tarde');
  assert.equal(invalidAfternoon.responseKind, 'INVALID_REQUEST_DATA');
  await process(conversation, '2');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_TIME);
  await process(conversation, '10:15');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_CONFIRMATION);
  assert.equal(conversation.contexto.appointment_request.preferred_time, '10:15');
});

test('resumen diferencia contacto nuevo y no muestra IDs', () => {
  const request = { contact_name: 'María', reason: 'Dolor de espalda', preferred_date: '2026-08-08', preferred_shift: 'MANANA' };
  const summary = buildSummary(CONTACT_TYPES.NEW, request, 'María');
  assert.match(summary, /^Revisa tu solicitud, María:/u);
  assert.doesNotMatch(summary, /Nombre:/u);
  assert.match(summary, /todavía no representa una cita confirmada/u);
  assert.doesNotMatch(summary, /paciente_id|conversation_id/u);
});

test('confirmacion crea una solicitud temporal una sola vez', async () => {
  const created = [];
  const requestModel = { create: async (data) => { created.push(data); return { id: 77 }; } };
  const conversation = makeConversation({
    paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION,
    contexto: { contact_first_name: 'Sergio', appointment_request: { reason: 'Dolor de rodilla', preferred_date: '2026-08-08', preferred_shift: 'MANANA', preferred_time: null } }
  });
  const result = await process(conversation, '1', requestModel);
  assert.equal(created.length, 1);
  assert.equal(created[0].paciente_id, 5);
  assert.equal(created[0].tipo_solicitud, 'AGENDAR');
  assert.equal(created[0].estado, 'PENDIENTE_CONFIRMACION');
  assert.equal(created[0].cita_id, null);
  assert.equal(created[0].datos_temporales.origen, 'WHATSAPP');
  assert.equal(conversation.estado, CONVERSATION_STATUS.ACTIVE);
  assert.deepEqual(conversation.contexto, { request_id: 77, contact_first_name: 'Sergio' });
  assert.match(result.responseText, /todavía no es una cita confirmada/u);
  assert.match(result.responseText, /^Sergio, tu solicitud/u);
  const duplicate = await process(conversation, '1', requestModel);
  assert.equal(created.length, 1);
  assert.equal(duplicate.responseText, MESSAGES.ALREADY_CREATED);
});

test('contacto nuevo crea solicitud sin paciente y cancelacion no inserta', async () => {
  let creates = 0;
  const requestModel = { create: async () => { creates += 1; return { id: 1 }; } };
  const fresh = makeConversation({
    tipo_contacto: CONTACT_TYPES.NEW, paciente_id: null,
    paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION,
    contexto: { appointment_request: { contact_name: 'María', reason: 'Dolor lumbar', preferred_date: '2026-08-08', preferred_shift: 'MANANA' } }
  });
  await process(fresh, '1', requestModel);
  assert.equal(creates, 1);
  const cancelled = makeConversation({ paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION, contexto: { appointment_request: { reason: 'privado' } } });
  await process(cancelled, '3', requestModel);
  assert.equal(creates, 1);
  assert.equal(cancelled.estado, CONVERSATION_STATUS.CANCELLED);
  assert.deepEqual(cancelled.contexto, {});
});

test('edicion conserva otros campos y vuelve al resumen', async () => {
  const conversation = makeConversation({
    tipo_contacto: CONTACT_TYPES.NEW,
    paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION,
    contexto: { appointment_request: { contact_name: 'Ana', reason: 'Dolor lumbar', preferred_date: '2026-08-08', preferred_shift: 'MANANA' } }
  });
  await process(conversation, '2');
  await process(conversation, '2');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
  await process(conversation, 'Dolor de hombro al mover');
  assert.equal(conversation.paso_actual, CONVERSATION_STEPS.WAITING_CONFIRMATION);
  assert.equal(conversation.contexto.appointment_request.contact_name, 'Ana');
  assert.equal(conversation.contexto.appointment_request.reason, 'Dolor de hombro al mover');
});

test('mensajes de inicio conservan Perfecto completo y UTF-8', () => {
  assert.match(MESSAGES.START_EXISTING(''), /^Perfecto 😊/u);
  assert.match(MESSAGES.START_NEW, /^¡Claro! 😊/u);
  assert.doesNotMatch(MESSAGES.START_NEW, /Ã|Â|ðŸ/u);
});

test('personaliza mensajes principales y usa saludo generico sin nombre', async () => {
  const existing = makeConversation({ paso_actual: CONVERSATION_STEPS.START_BOOKING, contexto: { contact_first_name: 'Sergio' } });
  assert.match((await process(existing, '1')).responseText, /^Perfecto, Sergio 😊/u);
  const generic = makeConversation({ paso_actual: CONVERSATION_STEPS.START_BOOKING, contexto: {} });
  assert.match((await process(generic, '1')).responseText, /^Perfecto 😊/u);

  const fresh = makeConversation({ tipo_contacto: CONTACT_TYPES.NEW, paciente_id: null, paso_actual: CONVERSATION_STEPS.WAITING_NAME });
  const named = await process(fresh, '   María   José ');
  assert.equal(fresh.contexto.contact_first_name, 'María');
  assert.match(named.responseText, /^Gracias, María\./u);
});

test('los logs del flujo no incluyen el nombre', async () => {
  const entries = [];
  const originalInfo = console.info;
  console.info = (...args) => entries.push(args.join(' '));
  try {
    const fresh = makeConversation({ tipo_contacto: CONTACT_TYPES.NEW, paciente_id: null, paso_actual: CONVERSATION_STEPS.WAITING_NAME });
    await process(fresh, 'NombrePrivado ApellidoPrivado');
  } finally {
    console.info = originalInfo;
  }
  assert.equal(entries.some((entry) => /NombrePrivado|ApellidoPrivado/u.test(entry)), false);
});

test('flujo vinculado ofrece días y turnos reales antes de crear la solicitud', async () => {
  const conversation = makeConversation({ contexto: { contact_first_name: 'Sergio' } });
  const created = [];
  const availability = {
    todayIso: () => '2026-08-04',
    addDays: (date, days) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10),
    findAvailableDates: async () => [{ date: '2026-08-05', shifts: ['MANANA', 'TARDE'], slotCount: 8 }],
    getAvailableSlots: async () => ({ slots: [
      { option: 1, date: '2026-08-05', start: '09:00', end: '10:30', shift: 'MANANA' },
      { option: 2, date: '2026-08-05', start: '15:00', end: '16:30', shift: 'TARDE' }
    ] })
  };
  const requestModel = { create: async (data) => { created.push(data); return { id: 91, ...data }; } };
  const args = (message) => processAppointmentStep({ conversation, message, requestModel, transaction: {}, activity, now: activity.ultimo_mensaje_en, availability });
  const days = await args('Dolor de rodilla al caminar');
  assert.equal(days.responseKind, 'AVAILABLE_DATES');
  assert.match(days.responseText, /1\. miércoles, 5 de agosto de 2026/iu);
  assert.equal(created.length, 0);
  const shifts = await args('1');
  assert.equal(shifts.responseKind, 'AVAILABLE_SHIFTS');
  assert.match(shifts.responseText, /1\. Mañana[\s\S]*2\. Tarde/u);
  assert.equal(created.length, 0);
  const result = await args('2');
  assert.equal(result.requestCreated.id, 91);
  assert.equal(created.length, 1);
  assert.equal(created[0].fecha_solicitada, '2026-08-05');
  assert.equal(created[0].datos_temporales.turno_preferido, 'TARDE');
});
