const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/services/whatsappReceptionReply.service');
const { processDeliveryStatus } = require('../../src/services/whatsappWebhook.service');

const user = { id: 7, rol: 'personal' };
const referral = { id: 2, estado: 'EN_ATENCION', responsable_usuario_id: 7, telefono_normalizado: '59170000000' };

test('sanea texto, conserva Unicode y rechaza HTML o más de 1000 caracteres', () => {
  assert.equal(service.sanitizeText('  Atención\r\n\r\n\r\nmañana  '), 'Atención\n\nmañana');
  assert.throws(() => service.sanitizeText('<b>dato</b>'), /HTML/);
  assert.throws(() => service.sanitizeText('x'.repeat(1001)), /1000/);
});

test('autoriza al responsable o admin y bloquea derivaciones no activas', () => {
  assert.doesNotThrow(() => service.authorize(referral, user));
  assert.doesNotThrow(() => service.authorize({ ...referral, responsable_usuario_id: 8 }, { id: 1, rol: 'admin' }));
  assert.throws(() => service.authorize({ ...referral, responsable_usuario_id: 8 }, user), /responsable/);
  assert.throws(() => service.authorize({ ...referral, estado: 'RESUELTA' }, user), /en atención/);
});

test('la ventana usa solo el último evento entrante real', async () => {
  let where;
  const result = await service.windowStatus({ phone: referral.telefono_normalizado, now: new Date('2026-08-04T12:00:00Z'), eventModel: { findOne: async (query) => { where = query.where; return { created_at: new Date('2026-08-04T11:00:00Z') }; } } });
  assert.equal(result.abierta, true); assert.equal(where.direccion, 'ENTRANTE'); assert.equal(where.tipo_evento, 'MENSAJE_RECIBIDO');
});

test('sin evento entrante la ventana queda indeterminada y no habilita texto libre', async () => {
  const result = await service.windowStatus({ phone: referral.telefono_normalizado, eventModel: { findOne: async () => null } });
  assert.deepEqual({ estado: result.estado, abierta: result.abierta }, { estado: 'INDETERMINADA', abierta: false });
});

test('preview persiste sin enviar, usa teléfono de la derivación e idempotencia única', async () => {
  let saved; const replyModel = { create: async (data) => { saved = data; return { id: 9, ...data, created_at: new Date() }; } };
  const result = await service.preview({ id: 2, user, body: { mensaje: 'Respuesta administrativa' }, now: new Date('2026-08-04T12:00:00Z'), referralModel: { findByPk: async () => referral }, eventModel: { findOne: async () => ({ created_at: new Date('2026-08-04T11:00:00Z') }) }, replyModel });
  assert.equal(saved.telefono_normalizado, referral.telefono_normalizado); assert.equal(saved.estado, 'PENDIENTE_CONFIRMACION'); assert.equal(saved.idempotency_key.length, 64); assert.equal(result.telefono.includes('*'), true);
});

test('envío real está deshabilitado por defecto antes de llamar Meta', async () => {
  const previous = process.env.WHATSAPP_MANUAL_REPLIES_ENABLED; delete process.env.WHATSAPP_MANUAL_REPLIES_ENABLED; let sent = false;
  try { await assert.rejects(() => service.confirm({ id: 2, replyId: 9, user, senderText: async () => { sent = true; } }), /deshabilitadas/); assert.equal(sent, false); }
  finally { if (previous == null) delete process.env.WHATSAPP_MANUAL_REPLIES_ENABLED; else process.env.WHATSAPP_MANUAL_REPLIES_ENABLED = previous; }
});

test('callback actualiza la respuesta por meta_message_id sin degradar el estado', async () => {
  let changes; const reply = { estado: 'ACEPTADO_META', update: async (value) => { changes = value; Object.assign(reply, value); } };
  const none = { findOne: async () => null }; const replies = { findOne: async ({ where }) => { assert.equal(where.meta_message_id, 'wamid.manual'); return reply; } };
  assert.equal(await processDeliveryStatus({ id: 'wamid.manual', status: 'delivered', timestamp: '1785844800' }, none, none, replies), 'updated');
  assert.equal(changes.estado, 'ENTREGADO'); assert.ok(changes.entregado_en instanceof Date);
  changes = null; await processDeliveryStatus({ id: 'wamid.manual', status: 'sent' }, none, none, replies); assert.equal(changes, null);
});
