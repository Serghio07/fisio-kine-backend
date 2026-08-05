const { getWhatsappConfig, getMissingWhatsappVariables } = require('../config/whatsapp');

const DEFAULT_TIMEOUT_MS = 10000;

const sanitizeMetaErrorMessage = (value) => {
  if (typeof value !== 'string') return 'WhatsApp Cloud API rechazo la solicitud';
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [OCULTO]')
    .replace(/EA[A-Za-z0-9]+/g, '[TOKEN_OCULTO]')
    .slice(0, 500);
};

const buildConfigurationError = (missing) => ({
  success: false,
  status: 0,
  code: 'CONFIGURATION_ERROR',
  message: `Faltan variables de configuracion: ${missing.join(', ')}`
});

const sendTextMessage = async (to, message, options = {}) => {
  const config = options.config || getWhatsappConfig();
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!config.enabled) return buildConfigurationError(['WHATSAPP_ENABLED']);

  const missing = options.config
    ? [
      !config.accessToken && 'WHATSAPP_ACCESS_TOKEN',
      !config.phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID',
      !config.apiVersion && 'WHATSAPP_API_VERSION'
    ].filter(Boolean)
    : getMissingWhatsappVariables(['accessToken', 'phoneNumberId', 'apiVersion']);
  if (missing.length > 0) return buildConfigurationError(missing);

  const recipient = typeof to === 'string' ? to.trim() : '';
  const text = typeof message === 'string' ? message.trim() : '';
  if (!/^\d{5,30}$/.test(recipient)) {
    return { success: false, status: 0, code: 'INVALID_RECIPIENT', message: 'Destinatario invalido' };
  }
  if (!text || text.length > 4096) {
    return { success: false, status: 0, code: 'INVALID_MESSAGE', message: 'Mensaje invalido' };
  }
  if (!/^v\d+\.\d+$/.test(config.apiVersion) || !/^\d+$/.test(config.phoneNumberId)) {
    return buildConfigurationError(['WHATSAPP_API_VERSION', 'WHATSAPP_PHONE_NUMBER_ID']);
  }
  if (typeof fetchImplementation !== 'function') {
    return { success: false, status: 0, code: 'HTTP_CLIENT_UNAVAILABLE', message: 'Cliente HTTP no disponible' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImplementation(
      `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: text }
        }),
        signal: controller.signal
      }
    );

    let data = {};
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }

    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        code: data?.error?.code || 'META_HTTP_ERROR',
        message: sanitizeMetaErrorMessage(data?.error?.message),
        type: typeof data?.error?.type === 'string' ? data.error.type.slice(0, 100) : undefined
      };
    }

    const messageId = data?.messages?.[0]?.id;
    if (typeof messageId !== 'string' || !messageId.trim()) {
      return {
        success: false,
        status: response.status,
        code: 'INVALID_META_RESPONSE',
        message: 'Meta no devolvio el identificador del mensaje'
      };
    }

    return {
      success: true,
      status: response.status,
      messageId: messageId.trim(),
      data: { messagingProduct: data.messaging_product || 'whatsapp' }
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, status: 0, code: 'TIMEOUT', message: 'Tiempo de espera agotado' };
    }
    return { success: false, status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con WhatsApp Cloud API' };
  } finally {
    clearTimeout(timeout);
  }
};

const sendTemplateMessage = async (to, template, parameters = [], options = {}) => {
  const config = options.config || getWhatsappConfig();
  const fetchImplementation = options.fetchImplementation || globalThis.fetch;
  if (!config.enabled) return buildConfigurationError(['WHATSAPP_ENABLED']);
  if (!template?.name || !template?.language) return buildConfigurationError(['WHATSAPP_REMINDER_TEMPLATE_NAME', 'WHATSAPP_REMINDER_TEMPLATE_LANGUAGE']);
  if (!/^\d{5,30}$/.test(String(to || '').trim())) return { success: false, status: 0, code: 'INVALID_RECIPIENT', message: 'Destinatario invalido' };
  if (!config.accessToken || !/^\d+$/.test(config.phoneNumberId || '') || !/^v\d+\.\d+$/.test(config.apiVersion || '')) return buildConfigurationError(['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_VERSION']);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImplementation(`https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).trim(), type: 'template', template: { name: template.name, language: { code: template.language }, components: [{ type: 'body', parameters: parameters.map((value) => ({ type: 'text', text: String(value).slice(0, 1024) })) }] } }), signal: controller.signal });
    let data = {}; try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) return { success: false, status: response.status, code: data?.error?.code || 'META_HTTP_ERROR', message: sanitizeMetaErrorMessage(data?.error?.message), type: data?.error?.type };
    const messageId = data?.messages?.[0]?.id;
    return messageId ? { success: true, status: response.status, messageId, data: { messagingProduct: data.messaging_product || 'whatsapp' } } : { success: false, status: response.status, code: 'INVALID_META_RESPONSE', message: 'Meta no devolvio el identificador del mensaje' };
  } catch (error) { return error?.name === 'AbortError' ? { success: false, status: 0, code: 'TIMEOUT', message: 'Tiempo de espera agotado' } : { success: false, status: 0, code: 'NETWORK_ERROR', message: 'No se pudo conectar con WhatsApp Cloud API' }; }
  finally { clearTimeout(timeout); }
};

module.exports = {
  DEFAULT_TIMEOUT_MS,
  sanitizeMetaErrorMessage,
  sendTextMessage,
  sendTemplateMessage
};
