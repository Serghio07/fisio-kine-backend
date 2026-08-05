const { Op } = require('sequelize');
const { WhatsappReceptionReferral } = require('../models');
const { normalizePhoneNumber } = require('../utils/phone');

const ACTIVE_STATES = Object.freeze(['PENDIENTE', 'EN_ATENCION']);
const scopeKeyFor = ({ type, conversationId, requestId, reminderId, appointmentId }) => {
  const reference = reminderId ? `reminder:${reminderId}` : requestId ? `request:${requestId}` : appointmentId ? `appointment:${appointmentId}` : `conversation:${conversationId}`;
  return `whatsapp-referral:${type}:${reference}`;
};
const minimalContext = (value = {}) => Object.fromEntries(Object.entries({
  technical_reason: value.technical_reason ? String(value.technical_reason).slice(0, 80) : undefined,
  requested_date: value.requested_date || undefined,
  requested_start: value.requested_start ? String(value.requested_start).slice(0, 5) : undefined,
  requested_end: value.requested_end ? String(value.requested_end).slice(0, 5) : undefined
}).filter(([, item]) => item != null));

const createOrReuseReceptionReferral = async ({
  conversation, type, transaction, referralModel = WhatsappReceptionReferral,
  requestId = null, reminderId = null, appointmentId = null, context = {}, now = new Date(), db
}) => {
  const phone = normalizePhoneNumber(conversation?.telefono);
  if (!phone || !conversation?.id) throw Object.assign(new Error('Referencia de derivación inválida'), { code: 'INVALID_REFERRAL_CONTEXT' });
  if (db) await db.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `whatsapp-referral:${phone}` }, transaction });
  const scopeKey = scopeKeyFor({ type, conversationId: conversation.id, requestId, reminderId, appointmentId });
  let referral = await referralModel.findOne({ where: { scope_key: scopeKey, estado: { [Op.in]: ACTIVE_STATES } }, transaction, lock: transaction.LOCK?.UPDATE });
  let created = false;
  if (!referral) {
    try {
      referral = await referralModel.create({
        tipo_derivacion: type, origen: 'WHATSAPP', estado: 'PENDIENTE', prioridad: 'NORMAL',
        telefono_normalizado: phone, paciente_id: conversation.paciente_id || null,
        cita_id: appointmentId, solicitud_cita_id: requestId, recordatorio_id: reminderId,
        conversacion_id: conversation.id, responsable_usuario_id: null, scope_key: scopeKey,
        contexto_minimo: minimalContext(context), historial: [{ accion: 'CREADA', origen: 'WHATSAPP', fecha: now.toISOString() }]
      }, { transaction });
      created = true;
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      referral = await referralModel.findOne({ where: { scope_key: scopeKey, estado: { [Op.in]: ACTIVE_STATES } }, transaction, lock: transaction.LOCK?.UPDATE });
      if (!referral) throw error;
    }
  }
  if (created && typeof transaction?.afterCommit === 'function') transaction.afterCommit(() => { const { newReferral } = require('./whatsappNotificationTrigger.service'); return newReferral(referral); });
  console.info(created ? '[WhatsApp] Derivación de recepción creada' : '[WhatsApp] Derivación activa reutilizada');
  return { referral, created };
};

module.exports = { ACTIVE_STATES, scopeKeyFor, minimalContext, createOrReuseReceptionReferral };
