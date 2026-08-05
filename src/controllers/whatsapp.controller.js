const crypto = require('crypto');
const { getWhatsappConfig, getMissingWhatsappVariables } = require('../config/whatsapp');
const { processWebhookPayload } = require('../services/whatsappWebhook.service');

const safeEqualStrings = (left, right) => {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyWebhook = (req, res) => {
  const config = getWhatsappConfig();
  if (!config.enabled) {
    return res.status(503).json({ message: 'Integracion de WhatsApp no disponible' });
  }

  const missing = getMissingWhatsappVariables(['verifyToken']);
  if (missing.length > 0) {
    console.error(`Configuracion de WhatsApp incompleta: ${missing.join(', ')}`);
    return res.status(503).json({ message: 'Integracion de WhatsApp no disponible' });
  }

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (typeof mode !== 'string' || typeof token !== 'string' || typeof challenge !== 'string') {
    return res.status(400).json({ message: 'Solicitud de verificacion incompleta' });
  }

  if (mode !== 'subscribe' || !safeEqualStrings(token, config.verifyToken)) {
    return res.status(403).json({ message: 'Verificacion rechazada' });
  }

  return res.status(200).type('text/plain').send(challenge);
};

const receiveWebhook = (req, res) => {
  const payload = req.body;
  res.status(200).json({ received: true });

  void processWebhookPayload(payload)
    .then((result) => {
      if (result.duplicates > 0) console.info(`[WhatsApp] ${result.duplicates} evento(s) duplicado(s) ignorado(s)`);
      if (result.invalid > 0) console.warn(`[WhatsApp] ${result.invalid} mensaje(s) con metadatos invalidos omitido(s)`);
      if (result.sendFailures > 0) console.error(`[WhatsApp] ${result.sendFailures} respuesta(s) no pudieron enviarse`);
    })
    .catch((error) => {
      console.error(`[WhatsApp] Error tecnico asincrono: ${error?.name || 'Error'}`);
    });

  return res;
};

module.exports = {
  verifyWebhook,
  receiveWebhook,
  safeEqualStrings
};
