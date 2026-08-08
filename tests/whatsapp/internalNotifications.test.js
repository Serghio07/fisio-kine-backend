const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../src/services/internalNotification.service');
const triggers = require('../../src/services/whatsappNotificationTrigger.service');
const { processPendingReferralAlerts, runCycle } = require('../../src/jobs/pendingReferralAlert.job');

const row = (changes = {}) => ({ id: 10, usuario_id: 2, tipo: 'NUEVA_DERIVACION', titulo: 'Nueva solicitud', mensaje: 'Existe una derivación pendiente.', entidad_tipo: 'DERIVACION_WHATSAPP', entidad_id: 8, derivacion_id: 8, respuesta_recepcion_id: null, prioridad: 'NORMAL', estado: 'NO_LEIDA', leida_en: null, created_at: new Date(), updated_at: new Date(), update: async function (value) { Object.assign(this, value); }, ...changes });
const activeUserModel = { findOne: async () => ({ id: 2 }) };

test('crea una notificación segura para un destinatario activo', async () => {
  let saved; const result = await service.createOne({ userId: 2, type: 'NUEVA_DERIVACION', title: 'Nueva solicitud', message: 'Existe una derivación pendiente.', entityType: 'DERIVACION_WHATSAPP', entityId: 8, referralId: 8, priority: 'NORMAL', idempotencyKey: 'new-referral:8:2', userModel: activeUserModel, model: { create: async data => { saved = data; return row(data); } } });
  assert.equal(result.created, true); assert.equal(saved.usuario_id, 2); assert.equal(saved.derivacion_id, 8); assert.equal(saved.telefono, undefined); assert.equal(saved.idempotency_key, 'new-referral:8:2');
});

test('no crea para usuario inactivo y absorbe unique violation idempotente', async () => {
  const inactive = await service.createOne({ userId: 2, type: 'NUEVA_DERIVACION', title: 'x', message: 'x', entityType: 'DERIVACION_WHATSAPP', entityId: 8, referralId: 8, idempotencyKey: 'key', userModel: { findOne: async () => null }, model: { create: async () => assert.fail() } });
  assert.equal(inactive.inactive, true);
  const duplicate = await service.createOne({ userId: 2, type: 'NUEVA_DERIVACION', title: 'x', message: 'x', entityType: 'DERIVACION_WHATSAPP', entityId: 8, referralId: 8, idempotencyKey: 'key', userModel: activeUserModel, model: { create: async () => { throw Object.assign(new Error('duplicate'), { name: 'SequelizeUniqueConstraintError' }); }, findOne: async () => row() } });
  assert.equal(duplicate.created, false);
});

test('listado filtra siempre por usuario y DTO no expone idempotencia ni datos sensibles', async () => {
  let query; const result = await service.list({ userId: 4, query: { estado: 'NO_LEIDA', tipo: 'RESPUESTA_PACIENTE', prioridad: 'ALTA', page: 2, limit: 5 }, model: { findAndCountAll: async value => { query = value; return { rows: [row()], count: 6 }; } } });
  assert.equal(query.where.usuario_id, 4); assert.equal(query.offset, 5); assert.equal(result.pagination.totalPages, 2); assert.equal(result.data[0].idempotency_key, undefined); assert.equal(result.data[0].telefono, undefined);
});

test('resumen cuenta únicamente las propias no leídas', async () => {
  const calls = []; const result = await service.summary({ userId: 5, model: { count: async ({ where }) => { calls.push(where); return calls.length; } } });
  assert.equal(result.no_leidas, 1); assert.equal(result.altas_no_leidas, 2); assert.ok(calls.every(where => where.usuario_id === 5 && where.estado === 'NO_LEIDA'));
});

test('marcar propia es idempotente, conserva fecha y nunca consulta ajena sin usuario', async () => {
  const item = row(); let audits = 0; const db = { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) }; const model = { findOne: async ({ where }) => { assert.deepEqual(where, { id: 10, usuario_id: 2 }); return item; } };
  const original = require('../../src/models').ActividadSistema.create; require('../../src/models').ActividadSistema.create = async () => { audits += 1; };
  try { const first = await service.markRead({ id: 10, userId: 2, now: new Date('2026-08-04T12:00:00Z'), db, model }); const firstDate = first.leida_en; await service.markRead({ id: 10, userId: 2, now: new Date('2026-08-04T13:00:00Z'), db, model }); assert.equal(item.estado, 'LEIDA'); assert.equal(item.leida_en, firstDate); assert.equal(audits, 1); } finally { require('../../src/models').ActividadSistema.create = original; }
});

test('marcar todas actualiza solo NO_LEIDA del usuario actual', async () => {
  let where; const db = { transaction: async callback => callback({}) }; const model = { update: async (_, options) => { where = options.where; return [0]; } }; const result = await service.markAllRead({ userId: 9, db, model }); assert.deepEqual(where, { usuario_id: 9, estado: 'NO_LEIDA' }); assert.equal(result.actualizadas, 0);
});

test('sincroniza automáticamente todas las notificaciones abiertas de una derivación', async () => {
  let values; let where; const transaction = {};
  const count = await service.markReferralNotificationsRead({ referralId: 8, transaction, now: new Date('2026-08-07T20:00:00Z'), model: { update: async (data, options) => { values = data; where = options.where; assert.equal(options.transaction, transaction); return [3]; } } });
  assert.equal(count, 3);
  assert.equal(values.estado, 'LEIDA');
  assert.equal(where.derivacion_id, 8);
  assert.equal(where.estado, 'NO_LEIDA');
});

test('nueva derivación notifica solo usuarios activos devueltos y usa claves deterministas', async () => {
  let data; const userModel = { findAll: async ({ where }) => { assert.equal(where.estado, 'activo'); assert.equal(where.activo, true); return [{ id: 1 }, { id: 3 }]; } }; const notificationService = { createForUsers: async value => { data = value; return []; } };
  await triggers.newReferral({ id: 44 }, { userModel, notificationService }); assert.deepEqual(data.userIds, [1, 3]); assert.equal(data.idempotencyKey(3), 'new-referral:44:3'); assert.equal(data.message.includes('teléfono'), false);
});

test('respuesta del paciente notifica responsable activo y no altera derivación', async () => {
  const referral = { id: 7, estado: 'EN_ATENCION', responsable_usuario_id: 3 }; let data; const userModel = { findAll: async () => [{ id: 3 }] }; await triggers.patientReply({ phone: '59170000000', metaMessageId: 'wamid.1' }, { conversationModel: { findOne: async () => ({ id: 22 }) }, referralModel: { findOne: async ({ where }) => { assert.equal(where.estado, 'EN_ATENCION'); assert.equal(where.conversacion_id, 22); return referral; } }, userModel, notificationService: { createForUsers: async value => { data = value; return []; } } }); assert.deepEqual(data.userIds, [3]); assert.equal(data.idempotencyKey(3), `patient-reply:${triggers.messageToken('wamid.1')}:3`); assert.equal(referral.estado, 'EN_ATENCION');
});

test('fallo definitivo vincula respuesta; emisor inactivo deriva a admin', async () => {
  let calls = 0; let data; const userModel = { findAll: async () => { calls += 1; return calls === 1 ? [] : [{ id: 1 }]; } }; await triggers.manualReplyFailed({ id: 12, usuario_id: 99, derivacion_id: 7 }, { userModel, notificationService: { createForUsers: async value => { data = value; return []; } } }); assert.deepEqual(data.userIds, [1]); assert.equal(data.replyId, 12); assert.equal(data.idempotencyKey(1), 'manual-failed:12:1');
});

test('job queda desactivado por defecto', async () => {
  const previous = process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; delete process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; try { const result = await processPendingReferralAlerts({ referralModel: { findAll: async () => assert.fail() } }); assert.equal(result.disabled, true); } finally { if (previous == null) delete process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; else process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED = previous; }
});

test('job usa PENDIENTE, umbral, lock y SKIP LOCKED sin modificar derivaciones', async () => {
  const oldEnabled = process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED = 'true'; let query; let payload; const transaction = { LOCK: { UPDATE: 'UPDATE' } }; const db = { transaction: async callback => callback(transaction) }; const referral = { id: 6, estado: 'PENDIENTE', created_at: new Date('2026-08-04T10:00:00Z') }; const userModel = { findAll: async () => [{ id: 1 }] };
  try { const result = await processPendingReferralAlerts({ now: new Date('2026-08-04T12:00:00Z'), db, referralModel: { findAll: async value => { query = value; return [referral]; } }, notificationModel: { findOne: async () => null }, userModel, notificationService: { createForUsers: async value => { payload = value; return [{ created: true }]; } } }); assert.equal(query.where.estado, 'PENDIENTE'); assert.equal(query.lock, 'UPDATE'); assert.equal(query.skipLocked, true); assert.equal(payload.priority, 'ALTA'); assert.equal(result.created, 1); assert.equal(referral.estado, 'PENDIENTE'); } finally { if (oldEnabled == null) delete process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; else process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED = oldEnabled; }
});

test('guardia del job evita ciclos superpuestos', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; }); const first = runCycle(async () => pending); const second = await runCycle(async () => assert.fail()); assert.equal(second.skipped, true); release({ ok: true }); await first;
});

test('job no repite alerta antes del intervalo configurado', async () => {
  const previous = process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED = 'true'; let recipients; try { const result = await processPendingReferralAlerts({ db: { transaction: async callback => callback({ LOCK: { UPDATE: 'UPDATE' } }) }, referralModel: { findAll: async () => [{ id: 6 }] }, notificationModel: { findOne: async () => ({ id: 99 }) }, userModel: { findAll: async () => [{ id: 1 }] }, notificationService: { createForUsers: async data => { recipients = data.userIds; return []; } } }); assert.deepEqual(recipients, []); assert.equal(result.created, 0); } finally { if (previous == null) delete process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED; else process.env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED = previous; }
});
