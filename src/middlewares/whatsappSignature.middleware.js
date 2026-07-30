const crypto = require('crypto');
const { whatsappConfig, validateWhatsappConfig } = require('../config/whatsapp');

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const calculateSignature = (rawBody, secret) => (
  `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
);

const validateWhatsappSignature = (req, res, next) => {
  const validation = validateWhatsappConfig('signature');
  if (!validation.ready) {
    return res.status(validation.reason === 'DISABLED' ? 503 : 500).json({
      message: validation.reason === 'DISABLED'
        ? 'Webhook de WhatsApp desactivado'
        : 'Webhook de WhatsApp no configurado'
    });
  }

  const signature = req.get('x-hub-signature-256');
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const expected = calculateSignature(rawBody, whatsappConfig.webhookSecret);
  if (!signature || !rawBody.length || !safeEqual(signature, expected)) {
    return res.status(401).json({ message: 'Firma de webhook no valida' });
  }
  return next();
};

module.exports = {
  validateWhatsappSignature,
  calculateSignature,
  safeEqual
};
