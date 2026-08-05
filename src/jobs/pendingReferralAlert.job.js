const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { WhatsappReceptionReferral, InternalNotification } = require('../models');
const { activeUsers } = require('../services/whatsappNotificationTrigger.service');
const notifications = require('../services/internalNotification.service');
const { getInternalNotificationsEnabled, getWhatsappReferralPendingAlertEnabled, getWhatsappReferralPendingAlertMinutes, getWhatsappReferralPendingAlertScanMinutes, getWhatsappReferralPendingAlertRepeatHours } = require('../config/whatsapp');
const {recordJob}=require('../services/whatsappJobMonitoring.service');

let timer = null; let running = false;
const processPendingReferralAlerts = async ({ now = new Date(), db = sequelize, referralModel = WhatsappReceptionReferral, notificationModel = InternalNotification, userModel, notificationService = notifications, limit = 50 } = {}) => {
  if (!getInternalNotificationsEnabled() || !getWhatsappReferralPendingAlertEnabled()) return { disabled: true, reviewed: 0, created: 0 };
  const threshold = new Date(now.getTime() - getWhatsappReferralPendingAlertMinutes() * 60000); const repeatMs = getWhatsappReferralPendingAlertRepeatHours() * 3600000; const bucket = Math.floor(now.getTime() / repeatMs); let reviewed = 0; let created = 0;
  await db.transaction(async (transaction) => {
    const referrals = await referralModel.findAll({ where: { estado: 'PENDIENTE', created_at: { [Op.lte]: threshold } }, order: [['created_at', 'ASC']], limit, transaction, lock: transaction.LOCK.UPDATE, skipLocked: true }); reviewed = referrals.length;
    if (!referrals.length) return; const admins = await activeUsers(['admin'], userModel);
    for (const referral of referrals) { const eligible = []; for (const userId of admins) { const recent = await notificationModel.findOne({ where: { usuario_id: userId, derivacion_id: referral.id, tipo: 'DERIVACION_PENDIENTE_VENCIDA', created_at: { [Op.gt]: new Date(now.getTime() - repeatMs) } }, attributes: ['id'], transaction }); if (!recent) eligible.push(userId); } const results = await notificationService.createForUsers({ userIds: eligible, type: 'DERIVACION_PENDIENTE_VENCIDA', title: 'Solicitud pendiente de atención', message: 'Una derivación continúa pendiente y requiere revisión.', entityType: 'DERIVACION_WHATSAPP', entityId: referral.id, referralId: referral.id, priority: 'ALTA', transaction, idempotencyKey: (userId) => `pending-overdue:${referral.id}:${userId}:${bucket}` }); created += results.filter((result) => result.created).length; }
  });
  console.info('[Notifications] Derivaciones pendientes revisadas'); return { reviewed, created };
};
const runCycle = async (processor = processPendingReferralAlerts) => { if (running) return { skipped: true }; running = true; try { return await processor(); } catch (_) { console.error('[Notifications] Error procesando seguimiento'); return { error: true }; } finally { running = false; } };
const startPendingReferralAlertJob = (options = {}) => { if (process.env.NODE_ENV === 'test' || !getInternalNotificationsEnabled() || !getWhatsappReferralPendingAlertEnabled() || timer) return false; const base = options.processor || processPendingReferralAlerts;const processor=()=>recordJob('ALERTAS_DERIVACIONES',base); timer = setInterval(() => { void runCycle(processor); }, getWhatsappReferralPendingAlertScanMinutes() * 60000); timer.unref?.(); void runCycle(processor); return true; };
const stopPendingReferralAlertJob = () => { if (timer) clearInterval(timer); timer = null; running = false; };
module.exports = { processPendingReferralAlerts, runCycle, startPendingReferralAlertJob, stopPendingReferralAlertJob };
