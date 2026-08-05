const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeMenuOption, normalizeCommand, normalizeGreeting, processConversationMessage, RESPONSES
} = require('../../src/services/whatsappConversation.service');
const {
  CONVERSATION_STATUS, CONVERSATION_STEPS, MAIN_OPTIONS, CONTACT_TYPES
} = require('../../src/models/WhatsappConversacion');

const fakeDb = {
  query: async () => {},
  transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } })
};

const conversation = (values = {}) => ({
  id: 3, telefono: '59160000000', tipo_contacto: CONTACT_TYPES.EXISTING,
  paciente_id: 5,
  estado: CONVERSATION_STATUS.ACTIVE, paso_actual: CONVERSATION_STEPS.WAITING_OPTION,
  opcion_principal: null, contexto: {}, expira_en: new Date('2026-08-04T15:00:00Z'),
  async update(data) { Object.assign(this, data); return this; },
  ...values
});

const run = (active, message, extra = {}) => {
  const created = [];
  const model = {
    findOne: async () => active,
    create: async (data) => { const item = conversation(data); created.push(item); return item; }
  };
  return processConversationMessage({
    phone: '59160000000', message, isText: true,
    identificationResponse: () => 'error'
  }, {
    conversationModel: model, sequelize: fakeDb, useAdvisoryLock: false,
    requestModel: extra.requestModel,
    patientModel: extra.patientModel || { findByPk: async () => ({ id: 5, estado: true, registro_pendiente: false }) },
    appointmentModel: extra.appointmentModel || { findAll: async () => [], findOne: async () => null },
    availabilityService: extra.availabilityService,
    referralModel: extra.referralModel || { findOne: async () => null, create: async (data) => ({ id: 1, ...data }) },
    timeoutMinutes: 30, now: '2026-08-04T14:00:00Z',
    identifyWhatsappContact: extra.identify || (async () => ({
      type: CONTACT_TYPES.EXISTING, found: true,
      patient: { id: 5, firstName: 'Ana' }
    }))
  }).then((result) => ({ result, created }));
};

test('normaliza opciones explicitas y rechaza entradas ambiguas', () => {
  for (const value of ['1', ' 1 ', '1.', 'opción 1', 'opcion 1', 'uno']) {
    assert.deepEqual(normalizeMenuOption(value), { valid: true, option: 1 });
  }
  for (const value of ['', '1 o 2', 'fecha 1/2', '60000000', 'quiero una cita mañana']) {
    assert.deepEqual(normalizeMenuOption(value), { valid: false, option: null });
  }
});

test('normaliza comandos globales sin distinguir mayusculas o tildes', () => {
  assert.equal(normalizeCommand(' menú '), 'MENU');
  assert.equal(normalizeCommand('Inicio'), 'INICIO');
  assert.equal(normalizeCommand('REINICIAR'), 'REINICIAR');
  assert.equal(normalizeCommand('salir'), 'SALIR');
  assert.equal(normalizeCommand('ayuda'), 'AYUDA');
});

test('normaliza saludos permitidos con mayusculas, tildes y espacios', () => {
  for (const greeting of ['HOLA', 'hola', '  Buen   día ', 'buen dia', 'HOLI', 'buenas tardes', 'BUENAS NOCHES']) assert.equal(normalizeGreeting(greeting), true);
  assert.equal(normalizeGreeting('hola doctor'), false);
});

test('saludo en menu conserva paso, contador y personaliza el menu', async () => {
  for (const greeting of ['HOLA', 'hola', 'BUEN DÍA']) {
    const active = conversation({ contexto: { invalid_attempts: 2, patient_reference: { id: 5, first_name: 'Sergio' } } });
    const { result } = await run(active, greeting);
    assert.equal(result.responseKind, 'MAIN_MENU');
    assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
    assert.equal(active.contexto.invalid_attempts, 2);
    assert.match(result.responseText, /Hola, Sergio/u);
  }
});

test('saludo dentro de un paso no avanza y muestra ayuda contextual', async () => {
  const active = conversation({ paso_actual: CONVERSATION_STEPS.WAITING_REASON });
  const { result } = await run(active, 'hola');
  assert.equal(result.responseKind, 'HELP');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
});

test('primer mensaje crea conversacion de paciente con expiracion y menu', async () => {
  const { result, created } = await run(null, 'hola');
  assert.equal(created.length, 1);
  assert.equal(created[0].telefono, '59160000000');
  assert.equal(created[0].paciente_id, 5);
  assert.equal(created[0].paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
  assert.equal(created[0].tipo_contacto, CONTACT_TYPES.EXISTING);
  assert.equal(created[0].expira_en.toISOString(), '2026-08-04T14:30:00.000Z');
  assert.match(result.responseText, /Hola, Ana/u);
  assert.deepEqual(created[0].contexto.patient_reference, { id: 5, first_name: 'Ana' });
});

test('paciente existente usa nombre cacheado sin consultar nuevamente', async () => {
  let identifications = 0;
  const active = conversation({
    paciente_id: 5,
    contexto: { patient_reference: { id: 5, first_name: 'Sergio' } }
  });
  const { result } = await run(active, '1', { identify: async () => { identifications += 1; throw new Error('no debe consultar'); } });
  assert.equal(identifications, 0);
  assert.match(result.responseText, /^Perfecto, Sergio 😊/u);
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
});

test('paciente existente sin nombre recibe inicio generico', async () => {
  const active = conversation({ paciente_id: 5, contexto: { patient_reference: { id: 5, first_name: '' } } });
  const { result } = await run(active, '1');
  assert.match(result.responseText, /^Perfecto 😊/u);
});

test('primer mensaje de contacto nuevo no crea paciente ni solicitud', async () => {
  const { created } = await run(null, 'hola', { identify: async () => ({ type: CONTACT_TYPES.NEW, found: false, patient: null }) });
  assert.equal(created[0].tipo_contacto, CONTACT_TYPES.NEW);
  assert.equal(created[0].paciente_id, null);
  assert.deepEqual(Object.keys(created[0]).filter((key) => /cita|solicitud/.test(key)), []);
});

test('menu de paciente aplica las cuatro transiciones', async () => {
  const expected = [
    [CONVERSATION_STEPS.WAITING_REASON, MAIN_OPTIONS.BOOK, 'MENU_SELECTION'],
    [CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, MAIN_OPTIONS.APPOINTMENTS, 'NO_UPCOMING_APPOINTMENTS'],
    [CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, MAIN_OPTIONS.RESCHEDULE_CANCEL, 'NO_UPCOMING_APPOINTMENTS'],
    [CONVERSATION_STEPS.RECEPTION, MAIN_OPTIONS.RECEPTION, 'RECEPTION_REFERRAL_CREATED']
  ];
  for (let option = 1; option <= 4; option += 1) {
    const active = conversation();
    const { result } = await run(active, String(option));
    assert.equal(active.paso_actual, expected[option - 1][0]);
    assert.equal(active.opcion_principal, expected[option - 1][1]);
    assert.equal(result.responseKind, expected[option - 1][2]);
  }
});

test('menu nuevo aplica dos opciones y rechaza las demas', async () => {
  const expected = [CONVERSATION_STEPS.WAITING_NAME, CONVERSATION_STEPS.RECEPTION];
  for (let option = 1; option <= 2; option += 1) {
    const active = conversation({ tipo_contacto: CONTACT_TYPES.NEW });
    await run(active, String(option));
    assert.equal(active.paso_actual, expected[option - 1]);
  }
  const active = conversation({ tipo_contacto: CONTACT_TYPES.NEW });
  const { result } = await run(active, '3');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
  assert.equal(result.responseKind, 'INVALID_OPTION');
});

test('invalida mantiene paso, renueva expiracion y limita contador', async () => {
  const active = conversation();
  await run(active, '9');
  await run(active, '9');
  const { result } = await run(active, '9');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
  assert.equal(active.contexto.invalid_attempts, 3);
  assert.equal(result.responseText, RESPONSES.TOO_MANY_INVALID);
  assert.equal(Object.values(active.contexto).includes('9'), false);
});

test('menu reinicia, ayuda conserva y cancelar finaliza solo conversacion', async () => {
  const active = conversation({ paso_actual: CONVERSATION_STEPS.START_BOOKING, opcion_principal: MAIN_OPTIONS.BOOK });
  await run(active, 'AYUDA');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.START_BOOKING);
  await run(active, 'MENÚ');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
  assert.equal(active.opcion_principal, null);
  const { result } = await run(active, 'CANCELAR');
  assert.equal(active.estado, CONVERSATION_STATUS.CANCELLED);
  assert.equal(result.responseText, RESPONSES.CANCELLED);
});

test('conversacion expirada se cierra y crea una nueva', async () => {
  const expired = conversation({ expira_en: new Date('2026-08-04T13:59:00Z') });
  const { created, result } = await run(expired, 'hola');
  assert.equal(expired.estado, CONVERSATION_STATUS.EXPIRED);
  assert.equal(created.length, 1);
  assert.equal(result.responseKind, 'MAIN_MENU');
});

test('paso de agendamiento heredado inicia recopilacion y multimedia no avanza', async () => {
  const active = conversation({ paso_actual: CONVERSATION_STEPS.START_BOOKING });
  const { result } = await run(active, 'mañana');
  assert.match(result.responseText, /^Perfecto 😊/u);
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
  const model = { findOne: async () => active };
  const media = await processConversationMessage({
    phone: active.telefono, isText: false, nonTextMessage: 'solo texto'
  }, { conversationModel: model, sequelize: fakeDb, useAdvisoryLock: false, timeoutMinutes: 30, now: '2026-08-04T14:00:00Z' });
  assert.equal(media.responseText, 'solo texto');
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_REASON);
});

test('estado desconocido expira y reinicia una conversacion valida', async () => {
  const invalid = conversation({ paso_actual: 'PASO_DESCONOCIDO' });
  const { result, created } = await run(invalid, 'hola');
  assert.equal(invalid.estado, CONVERSATION_STATUS.EXPIRED);
  assert.equal(created.length, 1);
  assert.equal(created[0].paso_actual, CONVERSATION_STEPS.WAITING_OPTION);
  assert.equal(result.responseKind, 'MAIN_MENU');
});

test('error al crear solicitud devuelve mensaje seguro', async () => {
  const active = conversation({
    paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION,
    contexto: { appointment_request: { reason: 'Dolor lumbar', preferred_date: '2026-08-08', preferred_shift: 'MANANA' } }
  });
  const { result } = await run(active, '1', {
    requestModel: { create: async () => { throw new Error('base no disponible'); } }
  });
  assert.equal(result.responseKind, 'REQUEST_CREATE_ERROR');
  assert.match(result.responseText, /No pudimos registrar tu solicitud/u);
  assert.equal(active.estado, CONVERSATION_STATUS.ACTIVE);
});

test('confirmar solicitud inicia disponibilidad sobre la misma solicitud', async () => {
  const request = {
    id: 77, tipo_solicitud: 'AGENDAR', estado: 'PENDIENTE_CONFIRMACION', paso_actual: 'SOLICITUD_CREADA',
    cita_id: null, fecha_solicitada: '2026-08-08', datos_temporales: { turno_preferido: 'MANANA' },
    async update(data) { Object.assign(this, data); return this; }
  };
  let creates = 0;
  const active = conversation({
    paciente_id: 5, paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION,
    contexto: { appointment_request: { reason: 'Dolor lumbar', preferred_date: '2026-08-08', preferred_shift: 'MANANA' } }
  });
  const { result } = await run(active, '1', {
    requestModel: { create: async () => { creates += 1; return request; } },
    availabilityService: {
      getAvailableSlots: async () => ({ date: '2026-08-08', capacity: 3, durationMinutes: 90, intervalMinutes: 30, slots: [{ option: 1, date: '2026-08-08', start: '09:00', end: '10:30' }] })
    }
  });
  assert.equal(creates, 1);
  assert.equal(result.responseKind, 'AVAILABLE_SLOTS');
  assert.equal(active.contexto.request_id, 77);
  assert.equal(active.paso_actual, CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
  assert.equal(request.paso_actual, CONVERSATION_STEPS.WAITING_SLOT_SELECTION);
});
