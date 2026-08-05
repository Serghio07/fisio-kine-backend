const WEBHOOK_PATH = '/api/whatsapp/webhook';

const getConversationTimeoutMinutes = () => {
  const value = Number.parseInt(process.env.WHATSAPP_CONVERSATION_TIMEOUT_MINUTES, 10);
  return Number.isInteger(value) && value >= 5 && value <= 1440 ? value : 30;
};

const readBoundedInteger = (name, fallback, min, max, allowed = null) => {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max || (allowed && !allowed.includes(value))) {
    console.warn(`[WhatsApp] Configuración inválida para ${name}; se usará el valor predeterminado`);
    return fallback;
  }
  return value;
};

const getWhatsappAppointmentDurationMinutes = () => readBoundedInteger('WHATSAPP_APPOINTMENT_DURATION_MINUTES', 90, 60, 90, [60, 90]);
const getWhatsappSlotIntervalMinutes = (duration = getWhatsappAppointmentDurationMinutes()) => {
  const value = readBoundedInteger('WHATSAPP_SLOT_INTERVAL_MINUTES', 30, 15, 60, [15, 30, 60]);
  return value <= duration ? value : 30;
};
const getWhatsappMaxAvailableSlots = () => readBoundedInteger('WHATSAPP_MAX_AVAILABLE_SLOTS', 5, 1, 10);
const getWhatsappSlotOptionsTimeoutMinutes = () => readBoundedInteger('WHATSAPP_SLOT_OPTIONS_TIMEOUT_MINUTES', 15, 1, 120);
const getWhatsappAvailabilitySearchDays = () => readBoundedInteger('WHATSAPP_AVAILABILITY_SEARCH_DAYS', 14, 1, 60);
const getWhatsappMaxAppointmentsList = () => readBoundedInteger('WHATSAPP_MAX_APPOINTMENTS_LIST', 5, 1, 10);
const getWhatsappAppointmentListTimeoutMinutes = () => readBoundedInteger('WHATSAPP_APPOINTMENT_LIST_TIMEOUT_MINUTES', 15, 1, 120);
const getWhatsappRemindersEnabled = () => process.env.WHATSAPP_REMINDERS_ENABLED === 'true';
const getWhatsappReminderHoursBefore = () => readBoundedInteger('WHATSAPP_REMINDER_HOURS_BEFORE', 24, 1, 168);
const getWhatsappReminderWindowMinutes = () => readBoundedInteger('WHATSAPP_REMINDER_WINDOW_MINUTES', 30, 1, 180);
const getWhatsappReminderScanIntervalMinutes = () => readBoundedInteger('WHATSAPP_REMINDER_SCAN_INTERVAL_MINUTES', 5, 1, 60);
const getWhatsappReminderMaxAttempts = () => readBoundedInteger('WHATSAPP_REMINDER_MAX_ATTEMPTS', 3, 1, 10);
const getWhatsappReminderRetryMinutes = () => readBoundedInteger('WHATSAPP_REMINDER_RETRY_MINUTES', 15, 1, 1440);
const getWhatsappReminderResponseTimeoutHours = () => readBoundedInteger('WHATSAPP_REMINDER_RESPONSE_TIMEOUT_HOURS', 48, 1, 168);
const getWhatsappReminderTemplate = () => ({ name: String(process.env.WHATSAPP_REMINDER_TEMPLATE_NAME || '').trim(), language: String(process.env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE || '').trim() });
const getWhatsappManualRepliesEnabled = () => process.env.WHATSAPP_MANUAL_REPLIES_ENABLED === 'true';
const getWhatsappManualReplyWindowHours = () => readBoundedInteger('WHATSAPP_MANUAL_REPLY_WINDOW_HOURS', 24, 1, 72);
const getWhatsappManualReplyPreviewMinutes = () => readBoundedInteger('WHATSAPP_MANUAL_REPLY_PREVIEW_MINUTES', 10, 1, 60);
const getWhatsappManualReplyMaxAttempts = () => readBoundedInteger('WHATSAPP_MANUAL_REPLY_MAX_ATTEMPTS', 3, 1, 10);
const getWhatsappManualReplyRetryMinutes = () => readBoundedInteger('WHATSAPP_MANUAL_REPLY_RETRY_MINUTES', 15, 1, 1440);
const readStrictBoolean = (name, fallback) => { const raw = process.env[name]; if (raw == null || raw === '') return fallback; if (raw === 'true') return true; if (raw === 'false') return false; console.warn(`[Notifications] Configuración inválida para ${name}; se usará el valor predeterminado`); return fallback; };
const getInternalNotificationsEnabled = () => readStrictBoolean('INTERNAL_NOTIFICATIONS_ENABLED', true);
const getInternalNotificationsPollSeconds = () => readBoundedInteger('INTERNAL_NOTIFICATIONS_POLL_SECONDS', 60, 15, 300);
const getWhatsappReferralPendingAlertEnabled = () => readStrictBoolean('WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED', false);
const getWhatsappReferralPendingAlertMinutes = () => readBoundedInteger('WHATSAPP_REFERRAL_PENDING_ALERT_MINUTES', 30, 5, 1440);
const getWhatsappReferralPendingAlertScanMinutes = () => readBoundedInteger('WHATSAPP_REFERRAL_PENDING_ALERT_SCAN_MINUTES', 5, 1, 60);
const getWhatsappReferralPendingAlertRepeatHours = () => readBoundedInteger('WHATSAPP_REFERRAL_PENDING_ALERT_REPEAT_HOURS', 4, 1, 168);
const getWhatsappMonitoringEnabled=()=>readStrictBoolean('WHATSAPP_MONITORING_ENABLED',true);
const getWhatsappMonitoringPollSeconds=()=>readBoundedInteger('WHATSAPP_MONITORING_POLL_SECONDS',60,15,300);
const getWhatsappMonitoringMetricsDays=()=>readBoundedInteger('WHATSAPP_MONITORING_METRICS_DAYS',30,1,90);
const getWhatsappMonitoringExportMaxDays=()=>readBoundedInteger('WHATSAPP_MONITORING_EXPORT_MAX_DAYS',90,1,365);
const getWhatsappMonitoringMetaCheckTimeoutMs=()=>readBoundedInteger('WHATSAPP_MONITORING_META_CHECK_TIMEOUT_MS',10000,1000,30000);
const getWhatsappMonitoringRetentionDays=()=>readBoundedInteger('WHATSAPP_MONITORING_RETENTION_DAYS',90,30,365);

const getWhatsappConfig = () => ({
  enabled: process.env.WHATSAPP_ENABLED === 'true',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
  apiVersion: process.env.WHATSAPP_API_VERSION || ''
});

const getMissingWhatsappVariables = (required = []) => {
  const config = getWhatsappConfig();
  if (!config.enabled) return [];

  const variableNames = {
    verifyToken: 'WHATSAPP_VERIFY_TOKEN',
    appSecret: 'WHATSAPP_APP_SECRET',
    accessToken: 'WHATSAPP_ACCESS_TOKEN',
    phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
    apiVersion: 'WHATSAPP_API_VERSION'
  };

  return required
    .filter((key) => !config[key])
    .map((key) => variableNames[key] || key);
};

const captureWhatsappRawBody = (req, res, buffer) => {
  if (!Buffer.isBuffer(buffer) || req.method !== 'POST') return;

  const pathname = String(req.originalUrl || req.url || '').split('?')[0];
  if (pathname === WEBHOOK_PATH) req.rawBody = Buffer.from(buffer);
};

module.exports = {
  WEBHOOK_PATH,
  getWhatsappConfig,
  getMissingWhatsappVariables,
  captureWhatsappRawBody,
  getConversationTimeoutMinutes,
  getWhatsappAppointmentDurationMinutes,
  getWhatsappSlotIntervalMinutes,
  getWhatsappMaxAvailableSlots,
  getWhatsappSlotOptionsTimeoutMinutes,
  getWhatsappAvailabilitySearchDays,
  getWhatsappMaxAppointmentsList,
  getWhatsappAppointmentListTimeoutMinutes,
  getWhatsappRemindersEnabled,
  getWhatsappReminderHoursBefore,
  getWhatsappReminderWindowMinutes,
  getWhatsappReminderScanIntervalMinutes,
  getWhatsappReminderMaxAttempts,
  getWhatsappReminderRetryMinutes,
  getWhatsappReminderResponseTimeoutHours,
  getWhatsappReminderTemplate,
  getWhatsappManualRepliesEnabled, getWhatsappManualReplyWindowHours, getWhatsappManualReplyPreviewMinutes,
  getWhatsappManualReplyMaxAttempts, getWhatsappManualReplyRetryMinutes,
  getInternalNotificationsEnabled, getInternalNotificationsPollSeconds,
  getWhatsappReferralPendingAlertEnabled, getWhatsappReferralPendingAlertMinutes,
  getWhatsappReferralPendingAlertScanMinutes, getWhatsappReferralPendingAlertRepeatHours,
  getWhatsappMonitoringEnabled,getWhatsappMonitoringPollSeconds,getWhatsappMonitoringMetricsDays,getWhatsappMonitoringExportMaxDays,getWhatsappMonitoringMetaCheckTimeoutMs,getWhatsappMonitoringRetentionDays
};
