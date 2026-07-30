const { whatsappConfig, validateWhatsappConfig } = require('../config/whatsapp');
const { queueWebhookEvent } = require('../services/whatsappWebhook.service');
const { safeEqual } = require('../middlewares/whatsappSignature.middleware');

const verifyWebhook = (req, res) => {
  const validation = validateWhatsappConfig('verify');
  if (!validation.ready) {
    return res.status(validation.reason === 'DISABLED' ? 503 : 500).json({
      message: validation.reason === 'DISABLED'
        ? 'Webhook de WhatsApp desactivado'
        : 'Webhook de WhatsApp no configurado'
    });
  }

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (
    mode === 'subscribe'
    && token
    && safeEqual(token, whatsappConfig.verifyToken)
    && challenge !== undefined
  ) {
    return res.status(200).type('text/plain').send(String(challenge));
  }
  return res.status(403).json({ message: 'No se pudo verificar el webhook' });
};

const receiveWebhook = (req, res) => {
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ message: 'Payload JSON no valido' });
  }

  res.sendStatus(200);
  queueWebhookEvent(payload);
  return undefined;
};

module.exports = { verifyWebhook, receiveWebhook };
