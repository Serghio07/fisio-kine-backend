const { getWhatsappConfig, getMissingWhatsappVariables } = require('../config/whatsapp');
const metaHealth = require('./whatsappMetaHealth.service');
const whatsappService = require('./whatsapp.service');
const { normalizePhoneNumber } = require('../utils/phone');

let lastVerification = null;

const getStatus = () => {
  const config = getWhatsappConfig();
  const missing = getMissingWhatsappVariables(['accessToken', 'phoneNumberId', 'apiVersion']);
  return {
    enabled: config.enabled,
    configured: config.enabled && missing.length === 0,
    phoneNumberConfigured: Boolean(config.phoneNumberId),
    webhookConfigured: Boolean(config.verifyToken && config.appSecret),
    apiVersion: config.apiVersion || null,
    lastVerification: lastVerification?.verificado_en || null,
    lastVerificationStatus: lastVerification?.estado || null
  };
};

const verifyConnection = async (userId, options = {}) => {
  lastVerification = await metaHealth.check({ userId, ...options });
  return lastVerification;
};

const sendTest = async (value, options = {}) => {
  const to = normalizePhoneNumber(value);
  if (!to) return { success: false, status: 400, code: 'INVALID_RECIPIENT', message: 'El numero de WhatsApp no es valido.' };
  const sendMessage = options.sendMessage || whatsappService.sendTextMessage;
  return sendMessage(to, 'Mensaje de prueba de Physio Active.');
};

module.exports = { getStatus, sendTest, verifyConnection };
