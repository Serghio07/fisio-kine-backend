const { whatsappConfig, validateWhatsappConfig } = require('../config/whatsapp');
const { summarizeText } = require('../utils/whatsapp');

const graphUrl = () => (
  `https://graph.facebook.com/${whatsappConfig.apiVersion}/${whatsappConfig.phoneNumberId}/messages`
);

const safeApiSummary = (data = {}) => ({
  messageId: data.messages?.[0]?.id || null,
  contact: data.contacts?.[0]?.wa_id || null,
  success: Boolean(data.messages?.[0]?.id)
});

const requestMessagesApi = async (payload, options = {}) => {
  const validation = validateWhatsappConfig('send');
  if (!validation.ready) {
    const error = new Error(validation.reason);
    error.code = validation.reason;
    error.configuration = validation.missing || validation.errors || [];
    throw error;
  }

  const maxAttempts = Math.min(Math.max(Number(options.maxAttempts) || 1, 1), 2);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(graphUrl(), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappConfig.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(summarizeText(data.error?.message || 'WhatsApp API request failed'));
        error.code = summarizeText(data.error?.code || response.status, 80);
        error.apiSummary = { success: false, status: response.status, code: error.code };
        error.retryable = response.status >= 500 || response.status === 429;
        throw error;
      }
      return { data, summary: safeApiSummary(data), attempts: attempt };
    } catch (error) {
      error.attempts = attempt;
      lastError = error;
      if (!error.retryable || attempt === maxAttempts) break;
    }
  }
  throw lastError;
};

const sendTextMessage = async (to, body, options) => requestMessagesApi({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: { preview_url: false, body }
}, options);

const notImplemented = async () => {
  const error = new Error('Metodo de WhatsApp reservado para una etapa posterior');
  error.code = 'NOT_IMPLEMENTED';
  throw error;
};

const markMessageAsRead = async (messageId) => requestMessagesApi({
  messaging_product: 'whatsapp',
  status: 'read',
  message_id: messageId
});

module.exports = {
  sendTextMessage,
  sendInteractiveButtons: notImplemented,
  sendListMessage: notImplemented,
  sendTemplateMessage: notImplemented,
  markMessageAsRead,
  safeApiSummary
};
