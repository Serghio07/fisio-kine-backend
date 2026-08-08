const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { InternalNotification, Usuario, ActividadSistema } = require('../models');
const { NOTIFICATION_TYPES, NOTIFICATION_STATES, NOTIFICATION_PRIORITIES } = require('../models/InternalNotification');
const { boliviaDateTime } = require('../utils/boliviaDateTime');
const { getInternalNotificationsPollSeconds } = require('../config/whatsapp');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const dto = (item) => ({ id: Number(item.id), tipo: item.tipo, titulo: item.titulo, mensaje: item.mensaje, entidad_tipo: item.entidad_tipo, entidad_id: Number(item.entidad_id), derivacion_id: item.derivacion_id ? Number(item.derivacion_id) : null, respuesta_recepcion_id: item.respuesta_recepcion_id ? Number(item.respuesta_recepcion_id) : null, prioridad: item.prioridad, estado: item.estado, leida_en: item.leida_en, created_at: item.created_at, updated_at: item.updated_at });
const activeUserWhere = { estado: 'activo', activo: true };

const createOne = async ({ userId, type, title, message, entityType, entityId, referralId = null, replyId = null, priority = 'NORMAL', idempotencyKey, transaction = null, model = InternalNotification, userModel = Usuario }) => {
  if (!NOTIFICATION_TYPES.includes(type) || !NOTIFICATION_PRIORITIES.includes(priority)) throw fail('Tipo o prioridad de notificación inválida.');
  const recipient = await userModel.findOne({ where: { id: userId, ...activeUserWhere }, attributes: ['id'], transaction });
  if (!recipient) return { notification: null, created: false, inactive: true };
  try {
    const notification = await model.create({ usuario_id: userId, tipo: type, titulo: title, mensaje: message, entidad_tipo: entityType, entidad_id: entityId, derivacion_id: referralId, respuesta_recepcion_id: replyId, prioridad: priority, estado: 'NO_LEIDA', leida_en: null, idempotency_key: idempotencyKey }, { transaction });
    console.info('[Notifications] Notificación interna creada'); return { notification, created: true };
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') { console.info('[Notifications] Notificación duplicada ignorada'); return { notification: await model.findOne({ where: { idempotency_key: idempotencyKey }, transaction }), created: false }; }
    throw error;
  }
};

const createForUsers = async ({ userIds, ...data }) => { const unique = [...new Set(userIds.map(Number).filter(Number.isInteger))]; const results = []; for (const userId of unique) results.push(await createOne({ userId, ...data, idempotencyKey: data.idempotencyKey(userId) })); return results; };
const list = async ({ userId, query = {}, model = InternalNotification }) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1); const limit = Math.min(50, Math.max(5, Number.parseInt(query.limit, 10) || 10)); const where = { usuario_id: userId };
  if (NOTIFICATION_STATES.includes(query.estado)) where.estado = query.estado;
  if (NOTIFICATION_TYPES.includes(query.tipo)) where.tipo = query.tipo;
  if (NOTIFICATION_PRIORITIES.includes(query.prioridad)) where.prioridad = query.prioridad;
  const result = await model.findAndCountAll({ where, order: [['created_at', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit });
  return { data: result.rows.map(dto), pagination: { page, limit, total: result.count, totalPages: Math.max(1, Math.ceil(result.count / limit)) } };
};
const recent = async ({ userId, limit = 5, model = InternalNotification }) => (await model.findAll({ where: { usuario_id: userId }, order: [['created_at', 'DESC'], ['id', 'DESC']], limit: Math.min(10, Math.max(1, Number(limit) || 5)) })).map(dto);
const summary = async ({ userId, model = InternalNotification }) => ({ no_leidas: await model.count({ where: { usuario_id: userId, estado: 'NO_LEIDA' } }), altas_no_leidas: await model.count({ where: { usuario_id: userId, estado: 'NO_LEIDA', prioridad: 'ALTA' } }), poll_seconds: getInternalNotificationsPollSeconds() });
const audit = async ({ userId, notificationId, action, transaction, activityModel = ActividadSistema }) => { const stamp = boliviaDateTime(); await activityModel.create({ usuario_id: userId, paciente_id: null, entidad_id: Number(notificationId) || null, fecha: stamp.fecha, hora: stamp.hora, modulo: 'Notificaciones', accion: action, detalle: action === 'LEER_TODAS' ? 'Marcó sus notificaciones como leídas' : 'Marcó una notificación como leída', datos: {}, metodo: 'PATCH', ruta: '/api/notificaciones' }, { transaction }); };
const markRead = async ({ id, userId, now = new Date(), db = sequelize, model = InternalNotification }) => db.transaction(async (transaction) => { const item = await model.findOne({ where: { id, usuario_id: userId }, transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Notificación no encontrada.', 404); if (item.estado === 'NO_LEIDA') { await item.update({ estado: 'LEIDA', leida_en: now }, { transaction }); await audit({ userId, notificationId: item.id, action: 'LEER', transaction }); console.info('[Notifications] Notificación marcada como leída'); } return dto(item); });
const markAllRead = async ({ userId, now = new Date(), db = sequelize, model = InternalNotification }) => db.transaction(async (transaction) => { const [count] = await model.update({ estado: 'LEIDA', leida_en: now }, { where: { usuario_id: userId, estado: 'NO_LEIDA' }, transaction }); if (count > 0) await audit({ userId, notificationId: null, action: 'LEER_TODAS', transaction }); console.info('[Notifications] Notificaciones marcadas como leídas'); return { actualizadas: count }; });

const markReferralNotificationsRead = async ({ referralId, transaction, now = new Date(), model = InternalNotification }) => {
  const [count] = await model.update({ estado: 'LEIDA', leida_en: now }, { where: { derivacion_id: referralId, estado: 'NO_LEIDA' }, transaction });
  if (count > 0) console.info('[Notifications] Notificaciones de derivación sincronizadas');
  return count;
};

module.exports = { dto, activeUserWhere, createOne, createForUsers, list, recent, summary, markRead, markAllRead, markReferralNotificationsRead };
