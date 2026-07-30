const { normalizedPhone } = require('../config/whatsapp');

const WEB_REFERENCE_PATTERN = /\bREF:WEB-PHYSIO\b/i;

const summarizeText = (value, maxLength = 500) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

const messageText = (message = {}) => {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.title
      || '';
  }
  return '';
};

const timestampToDate = (timestamp) => {
  const numeric = Number(timestamp);
  return Number.isFinite(numeric) && numeric > 0 ? new Date(numeric * 1000) : new Date();
};

const extractWebhookEvents = (payload = {}) => {
  if (payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
    return { messages: [], statuses: [] };
  }

  const messages = [];
  const statuses = [];
  for (const entry of payload.entry) {
    for (const change of entry?.changes || []) {
      if (change?.field !== 'messages') continue;
      const value = change.value || {};
      for (const message of value.messages || []) {
        messages.push({
          externalId: summarizeText(message.id, 255),
          from: normalizedPhone(message.from),
          type: summarizeText(message.type || 'unknown', 40),
          text: summarizeText(messageText(message)),
          date: timestampToDate(message.timestamp)
        });
      }
      for (const status of value.statuses || []) {
        const error = Array.isArray(status.errors) ? status.errors[0] : null;
        statuses.push({
          externalId: summarizeText(status.id, 255),
          status: summarizeText(status.status, 30).toLowerCase(),
          date: timestampToDate(status.timestamp),
          errorCode: summarizeText(error?.code, 80),
          errorMessage: summarizeText(error?.title || error?.message, 500)
        });
      }
    }
  }
  return { messages, statuses };
};

const detectOrigin = (text) => WEB_REFERENCE_PATTERN.test(String(text || ''))
  ? { origin: 'WEB', reference: 'WEB-PHYSIO' }
  : { origin: 'WHATSAPP', reference: null };

const stripWebReference = (text) => summarizeText(
  String(text || '')
    .replace(WEB_REFERENCE_PATTERN, '')
    .replace(/\s+([.,;:!?])/g, '$1')
);

const maskPhone = (phone) => {
  const normalized = normalizedPhone(phone);
  if (!normalized) return 'sin-numero';
  return `${'*'.repeat(Math.max(normalized.length - 4, 4))}${normalized.slice(-4)}`;
};

const partialMessageId = (messageId) => {
  const value = summarizeText(messageId, 255);
  if (value.length <= 12) return value;
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
};

module.exports = {
  WEB_REFERENCE_PATTERN,
  summarizeText,
  extractWebhookEvents,
  detectOrigin,
  stripWebReference,
  maskPhone,
  partialMessageId
};
