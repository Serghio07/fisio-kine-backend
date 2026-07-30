const test = require('node:test');
const assert = require('node:assert/strict');

process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
process.env.WHATSAPP_APPOINTMENTS_ENABLED = 'false';
process.env.WHATSAPP_TEST_MODE = 'true';
process.env.WHATSAPP_TEST_NUMBERS = '59170000001';

const {
  sequelize,
  ConversacionWhatsapp,
  MensajeWhatsapp,
  AuditoriaWhatsapp
} = require('../../src/models');

const conversations = [];
const messages = [];
const audits = [];
let nextConversationId = 1;
let nextMessageId = 1;
let sends = 0;

const record = (values, id) => ({
  id,
  ...values,
  async update(updates) {
    Object.assign(this, updates);
    return this;
  }
});

sequelize.transaction = async (callback) => callback({});
sequelize.query = async () => [[], {}];
ConversacionWhatsapp.findOne = async ({ where }) => conversations.find(
  (item) => item.telefono === where.telefono && ['INICIADA', 'ACTIVA'].includes(item.estado)
) || null;
ConversacionWhatsapp.create = async (values) => {
  const item = record(values, nextConversationId++);
  conversations.push(item);
  return item;
};
MensajeWhatsapp.findOne = async ({ where }) => messages.find(
  (item) => item.message_id_externo === where.message_id_externo
) || null;
MensajeWhatsapp.create = async (values) => {
  const item = record(values, nextMessageId++);
  messages.push(item);
  return item;
};
AuditoriaWhatsapp.create = async (values) => {
  const item = record(values, audits.length + 1);
  audits.push(item);
  return item;
};

const { processWebhookEvent } = require('../../src/services/whatsappWebhook.service');

const payload = {
  object: 'whatsapp_business_account',
  entry: [{
    changes: [{
      field: 'messages',
      value: {
        messages: [{
          id: 'wamid.IN-1',
          from: '59170000001',
          timestamp: '1710000000',
          type: 'text',
          text: { body: 'Hola, quiero agendar. REF:WEB-PHYSIO' }
        }]
      }
    }]
  }]
};

const sendTextMessage = async () => {
  sends += 1;
  return {
    summary: { success: true, messageId: 'wamid.OUT-1', contact: '59170000001' },
    attempts: 1
  };
};

test('registra conversacion, mensaje y bienvenida una sola vez', async () => {
  const first = await processWebhookEvent(payload, { sendTextMessage });
  const second = await processWebhookEvent(payload, { sendTextMessage });

  assert.equal(first.results[0].recorded, true);
  assert.equal(second.results[0].duplicate, true);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0].origen_conversacion, 'WEB');
  assert.equal(conversations[0].referencia_origen, 'WEB-PHYSIO');
  assert.equal(messages.filter((item) => item.direccion === 'ENTRANTE').length, 1);
  assert.equal(messages.filter((item) => item.direccion === 'SALIENTE').length, 1);
  assert.equal(messages.find((item) => item.direccion === 'ENTRANTE').contenido_resumido.includes('REF:WEB-PHYSIO'), false);
  assert.equal(messages.find((item) => item.direccion === 'SALIENTE').contenido_resumido.includes('1. Para mí'), true);
  assert.equal(sends, 1);
  assert.equal(audits.some((item) => item.accion === 'MENSAJE_DUPLICADO'), true);
});

test('actualiza estados sent, delivered y read por identificador externo', async () => {
  for (const [status, timestamp] of [['sent', '1710000001'], ['delivered', '1710000002'], ['read', '1710000003']]) {
    await processWebhookEvent({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: {
        statuses: [{ id: 'wamid.OUT-1', status, timestamp }]
      } }] }]
    });
  }
  const outgoing = messages.find((item) => item.message_id_externo === 'wamid.OUT-1');
  assert.equal(outgoing.estado_envio, 'READ');
  assert.ok(outgoing.fecha_envio);
  assert.ok(outgoing.fecha_entrega);
  assert.ok(outgoing.fecha_lectura);
});

test('no crea pacientes, citas ni modifica agenda', () => {
  assert.equal(process.env.WHATSAPP_APPOINTMENTS_ENABLED, 'false');
  assert.equal(messages.some((item) => item.paciente_id || item.cita_id), false);
});

test('numero no autorizado solo genera auditoria y no conversacion activa', async () => {
  const conversationCount = conversations.length;
  const messageCount = messages.length;
  const unauthorized = JSON.parse(JSON.stringify(payload));
  unauthorized.entry[0].changes[0].value.messages[0].id = 'wamid.UNAUTHORIZED';
  unauthorized.entry[0].changes[0].value.messages[0].from = '59170000099';

  const result = await processWebhookEvent(unauthorized, { sendTextMessage });
  assert.equal(result.results[0].reason, 'TEST_NUMBER_NOT_ALLOWED');
  assert.equal(conversations.length, conversationCount);
  assert.equal(messages.length, messageCount);
  assert.equal(audits.some((item) => item.accion === 'NUMERO_NO_AUTORIZADO'), true);
});
