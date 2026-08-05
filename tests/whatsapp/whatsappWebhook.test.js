const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  NON_TEXT_MESSAGE,
  NEW_CONTACT_MESSAGE,
  INTEGRITY_ERROR_MESSAGE,
  IDENTIFICATION_ERROR_MESSAGE,
  buildExistingPatientMessage,
  extractWebhookData,
  buildMinimalIncomingEvent,
  registerIncomingEvent,
  processDeliveryStatus,
  processWebhookPayload
} = require('../../src/services/whatsappWebhook.service');
const { RESPONSES: CONVERSATION_RESPONSES } = require('../../src/services/whatsappConversation.service');

const buildPayload = (messages = [], statuses = []) => ({
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: '12345', display_phone_number: '15550000000' },
        contacts: [{ wa_id: '59160000000', profile: { name: 'Paciente Prueba' } }],
        messages,
        statuses
      }
    }]
  }]
});

const textMessage = {
  id: 'wamid.prueba-1',
  from: '59160000000',
  type: 'text',
  timestamp: '1700000000',
  text: { body: 'contenido confidencial de prueba' }
};

test('extrae texto y contacto solo para procesamiento transitorio', () => {
  assert.deepEqual(extractWebhookData(null), { messages: [], statusesCount: 0, statuses: [] });
  const extracted = extractWebhookData(buildPayload([textMessage], [{ id: 'estado-1', status: 'delivered' }]));
  assert.equal(extracted.messages.length, 1);
  assert.equal(extracted.messages[0].text, 'contenido confidencial de prueba');
  assert.equal(extracted.messages[0].contactName, 'Paciente Prueba');
  assert.equal(extracted.statusesCount, 1);
});

test('el evento entrante no persiste texto ni payload completo', () => {
  const message = extractWebhookData(buildPayload([textMessage])).messages[0];
  const event = buildMinimalIncomingEvent(message);
  assert.equal(event.meta_message_id, 'wamid.prueba-1');
  assert.equal(event.direccion, 'ENTRANTE');
  assert.equal(event.tipo_evento, 'MENSAJE_RECIBIDO');
  assert.equal(Object.hasOwn(event.datos, 'contact_name'), false);
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes('contenido confidencial de prueba'), false);
  assert.equal(serialized.includes('raw_payload'), false);
});

test('mensaje de texto guarda entrada, envia bienvenida y guarda salida', async () => {
  const rows = [];
  const sent = [];
  const eventModel = { create: async (value) => { rows.push(value); return value; } };
  const sendTextMessage = async (to, text) => {
    sent.push({ to, text });
    return { success: true, status: 200, messageId: 'wamid.salida-1', data: { messagingProduct: 'whatsapp' } };
  };
  const result = await processWebhookPayload(buildPayload([textMessage]), {
    eventModel,
    sendTextMessage,
    identifyWhatsappContact: async () => ({
      type: 'PACIENTE_EXISTENTE',
      found: true,
      patient: { id: 1, firstName: 'Sergio', displayName: 'Sergio' }
    })
  });

  assert.equal(result.replied, 1);
  assert.deepEqual(sent, [{ to: '59160000000', text: buildExistingPatientMessage('Sergio') }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].direccion, 'ENTRANTE');
  assert.equal(rows[1].direccion, 'SALIENTE');
  assert.equal(rows[1].tipo_evento, 'CONFIRMACION_ENVIADA');
  assert.equal(rows[1].estado, 'ENVIADO');
  assert.equal(rows[1].datos.contact_type, 'PACIENTE_EXISTENTE');
});

test('contacto nuevo y error de integridad reciben mensajes diferentes', async () => {
  for (const [type, expected] of [
    ['CONTACTO_NUEVO', NEW_CONTACT_MESSAGE],
    ['ERROR_INTEGRIDAD_TELEFONO', INTEGRITY_ERROR_MESSAGE]
  ]) {
    let sentText;
    await processWebhookPayload(buildPayload([{ ...textMessage, id: `wamid.${type}` }]), {
      eventModel: { create: async () => {} },
      identifyWhatsappContact: async () => ({ type, found: false, patient: null }),
      sendTextMessage: async (to, text) => {
        sentText = text;
        return { success: true, status: 200, messageId: `wamid.salida.${type}`, data: {} };
      }
    });
    assert.equal(sentText, expected);
  }
});

test('los mensajes de etapa 8 conservan Unicode correcto', () => {
  assert.match(NEW_CONTACT_MESSAGE, /👋/u);
  assert.match(NEW_CONTACT_MESSAGE, /¿Qué deseas realizar\?/u);
  assert.doesNotMatch(INTEGRITY_ERROR_MESSAGE, /más de un registro|pacientes|personas/u);
  assert.doesNotMatch(NEW_CONTACT_MESSAGE, /Ã|Â|ðŸ/u);
});

test('error de identificacion usa respuesta generica', async () => {
  let sentText;
  const result = await processWebhookPayload(buildPayload([textMessage]), {
    eventModel: { create: async () => {} },
    identifyWhatsappContact: async () => { throw new Error('base no disponible'); },
    sendTextMessage: async (to, text) => {
      sentText = text;
      return { success: true, status: 200, messageId: 'wamid.error-identificacion', data: {} };
    }
  });
  assert.equal(result.replied, 1);
  assert.equal(sentText, CONVERSATION_RESPONSES.ERROR);
});

test('un duplicado no se guarda de nuevo ni genera respuesta', async () => {
  let sendCalls = 0;
  let identificationCalls = 0;
  const eventModel = {
    create: async () => {
      const error = new Error('duplicado');
      error.name = 'SequelizeUniqueConstraintError';
      throw error;
    }
  };
  const result = await processWebhookPayload(buildPayload([textMessage]), {
    eventModel,
    sendTextMessage: async () => { sendCalls += 1; },
    identifyWhatsappContact: async () => { identificationCalls += 1; }
  });
  assert.equal(result.duplicates, 1);
  assert.equal(sendCalls, 0);
  assert.equal(identificationCalls, 0);
});

test('mensaje no textual recibe el aviso compatible', async () => {
  const rows = [];
  let sentText;
  const imageMessage = { ...textMessage, id: 'wamid.imagen', type: 'image', image: { id: 'media-1' } };
  delete imageMessage.text;
  const result = await processWebhookPayload(buildPayload([imageMessage]), {
    eventModel: { create: async (value) => { rows.push(value); } },
    identifyWhatsappContact: async () => assert.fail('no debe consultar pacientes'),
    sendTextMessage: async (to, text) => {
      sentText = text;
      return { success: true, status: 200, messageId: 'wamid.aviso', data: {} };
    }
  });
  assert.equal(result.replied, 1);
  assert.equal(sentText, NON_TEXT_MESSAGE);
  assert.equal(rows.length, 2);
});

test('statuses se reconocen sin persistir ni responder', async () => {
  let createCalls = 0;
  let sendCalls = 0;
  const result = await processWebhookPayload(buildPayload([], [{ id: 'salida', status: 'read' }]), {
    eventModel: { create: async () => { createCalls += 1; }, findOne: async () => null },
    reminderModel: { findOne: async () => null },
    sendTextMessage: async () => { sendCalls += 1; }
  });
  assert.equal(result.statuses, 1);
  assert.equal(createCalls, 0);
  assert.equal(sendCalls, 0);
});

test('callbacks actualizan entrega sin degradar estado ni sobrescribir respuesta', async () => {
  const updates = [];
  const reminder = { estado: 'ACEPTADO', async update(value) { updates.push(value); Object.assign(this, value); } };
  const reminderModel = { findOne: async () => reminder };
  const eventModel = { findOne: async () => null };
  await processDeliveryStatus({ id: 'wamid.recordatorio', status: 'delivered', timestamp: '1785844800' }, eventModel, reminderModel);
  await processDeliveryStatus({ id: 'wamid.recordatorio', status: 'sent', timestamp: '1785844700' }, eventModel, reminderModel);
  assert.equal(reminder.estado, 'ENTREGADO');
  assert.equal(updates.length, 1);

  reminder.estado = 'RESPONDIDO';
  await processDeliveryStatus({ id: 'wamid.recordatorio', status: 'read', timestamp: '1785844900' }, eventModel, reminderModel);
  assert.equal(reminder.estado, 'RESPONDIDO');
  assert.ok(reminder.leido_en instanceof Date);
});

test('remitente invalido no consulta pacientes ni intenta responder', async () => {
  let identificationCalls = 0;
  let sendCalls = 0;
  const invalidSender = { ...textMessage, id: 'wamid.remitente-invalido', from: 'sin-numero' };
  const result = await processWebhookPayload(buildPayload([invalidSender]), {
    eventModel: { create: async () => assert.fail('no debe persistir un evento invalido') },
    identifyWhatsappContact: async () => { identificationCalls += 1; },
    sendTextMessage: async () => { sendCalls += 1; }
  });
  assert.equal(result.invalid, 1);
  assert.equal(identificationCalls, 0);
  assert.equal(sendCalls, 0);
});

test('un error de Meta guarda ERROR_ENVIO sin detener el lote', async () => {
  const rows = [];
  const result = await processWebhookPayload(buildPayload([textMessage]), {
    eventModel: { create: async (value) => { rows.push(value); } },
    identifyWhatsappContact: async () => ({ type: 'CONTACTO_NUEVO', found: false, patient: null }),
    sendTextMessage: async () => ({ success: false, status: 401, code: 190, message: 'Invalid token' })
  });
  assert.equal(result.sendFailures, 1);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].tipo_evento, 'ERROR_ENVIO');
  assert.equal(rows[1].estado, 'FALLIDO');
  assert.equal(rows[1].error_codigo, '190');
});

test('integra respuesta conversacional y persiste paso tecnico en evento saliente', async () => {
  const rows = [];
  let receivedInput;
  const result = await processWebhookPayload(buildPayload([textMessage]), {
    eventModel: { create: async (value) => { rows.push(value); } },
    processConversationMessage: async (input) => {
      receivedInput = input;
      return {
        responseText: 'respuesta de etapa 9',
        responseKind: 'MENU_SELECTION',
        contactType: 'PACIENTE_EXISTENTE',
        conversationStep: 'INICIO_AGENDAR_CITA'
      };
    },
    sendTextMessage: async () => ({ success: true, messageId: 'wamid.etapa9', data: {} })
  });
  assert.equal(result.replied, 1);
  assert.equal(receivedInput.message, 'contenido confidencial de prueba');
  assert.equal(rows[1].datos.response_kind, 'MENU_SELECTION');
  assert.equal(rows[1].datos.conversation_step, 'INICIO_AGENDAR_CITA');
  assert.equal(JSON.stringify(rows).includes('contenido confidencial de prueba'), false);
});

test('procesa varios mensajes secuencialmente', async () => {
  const messages = [textMessage, { ...textMessage, id: 'wamid.prueba-2' }];
  let sequence = 0;
  const rows = [];
  const result = await processWebhookPayload(buildPayload(messages), {
    eventModel: { create: async (value) => { rows.push(value); } },
    identifyWhatsappContact: async () => ({ type: 'CONTACTO_NUEVO', found: false, patient: null }),
    sendTextMessage: async () => ({ success: true, status: 200, messageId: `wamid.salida-${++sequence}`, data: {} })
  });
  assert.equal(result.replied, 2);
  assert.equal(rows.length, 4);
});

test('clasifica solo el error unique como duplicado', async () => {
  const uniqueModel = { create: async () => { const error = new Error('duplicado'); error.name = 'SequelizeUniqueConstraintError'; throw error; } };
  assert.equal(await registerIncomingEvent({}, uniqueModel), 'duplicate');
  const databaseModel = { create: async () => { const error = new Error('conexion'); error.name = 'SequelizeConnectionError'; throw error; } };
  await assert.rejects(() => registerIncomingEvent({}, databaseModel), /conexion/);
});

test('expone GET y POST publicos con verificacion y firma', async (context) => {
  const previous = {
    enabled: process.env.WHATSAPP_ENABLED,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET
  };
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-ficticio';
  process.env.WHATSAPP_APP_SECRET = 'app-secret-ficticio';

  const app = require('../../src/app');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/whatsapp/webhook`;
  const challengeResponse = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=verify-token-ficticio&hub.challenge=reto-123`);
  assert.equal(challengeResponse.status, 200);
  assert.equal(await challengeResponse.text(), 'reto-123');

  const rejectedToken = await fetch(`${baseUrl}?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=reto-123`);
  assert.equal(rejectedToken.status, 403);

  const rawBody = Buffer.from(JSON.stringify({ object: 'evento_irrelevante', entry: [] }));
  const signature = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  const acceptedPost = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: rawBody
  });
  assert.equal(acceptedPost.status, 200);
  assert.deepEqual(await acceptedPost.json(), { received: true });

  const invalidSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
  const rejectedPost = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': invalidSignature },
    body: rawBody
  });
  assert.equal(rejectedPost.status, 401);

  const malformedBody = Buffer.from('{"object":');
  const malformedSignature = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(malformedBody).digest('hex')}`;
  const malformedPost = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': malformedSignature },
    body: malformedBody
  });
  assert.equal(malformedPost.status, 400);

  if (previous.enabled === undefined) delete process.env.WHATSAPP_ENABLED;
  else process.env.WHATSAPP_ENABLED = previous.enabled;
  if (previous.verifyToken === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
  else process.env.WHATSAPP_VERIFY_TOKEN = previous.verifyToken;
  if (previous.appSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = previous.appSecret;
});
