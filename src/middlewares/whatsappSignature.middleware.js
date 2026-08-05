const crypto = require('crypto');
const { getWhatsappConfig, getMissingWhatsappVariables } = require('../config/whatsapp');
const incidents=require('../services/whatsappIncident.service');
const recordInvalid=()=>{if(process.env.NODE_TEST_CONTEXT)return;const bucket=Math.floor(Date.now()/3600000);void incidents.createOrIncrement({type:'WEBHOOK_FIRMA_INVALIDA',severity:'WARNING',entityType:'WEBHOOK',entityRef:`signature:${bucket}`,code:'INVALID_SIGNATURE',summary:'Webhook rechazado por firma inválida',category:'PERMANENTE',recoverable:false,idempotencyKey:`invalid-signature:${bucket}`}).catch(()=>{});};

const SIGNATURE_PATTERN = /^sha256=([a-fA-F0-9]{64})$/;

const validarFirmaWhatsapp = (req, res, next) => {
  const config = getWhatsappConfig();
  if (!config.enabled) {
    return res.status(503).json({ message: 'Integracion de WhatsApp no disponible' });
  }

  const missing = getMissingWhatsappVariables(['appSecret']);
  if (missing.length > 0) {
    console.error(`Configuracion de WhatsApp incompleta: ${missing.join(', ')}`);
    return res.status(503).json({ message: 'Integracion de WhatsApp no disponible' });
  }

  if (!Buffer.isBuffer(req.rawBody)) {
    console.error('No se pudo validar la firma de WhatsApp: cuerpo original no disponible');
    return res.status(500).json({ message: 'No se pudo validar la solicitud' });
  }

  const signatureHeader = req.get('x-hub-signature-256');
  const match = typeof signatureHeader === 'string' && signatureHeader.match(SIGNATURE_PATTERN);
  if (!match) { recordInvalid(); return res.status(401).json({ message: 'Solicitud no autorizada' }); }

  const receivedSignature = Buffer.from(match[1], 'hex');
  const calculatedSignature = crypto
    .createHmac('sha256', config.appSecret)
    .update(req.rawBody)
    .digest();

  if (
    receivedSignature.length !== calculatedSignature.length ||
    !crypto.timingSafeEqual(receivedSignature, calculatedSignature)
  ) {
    recordInvalid();
    return res.status(401).json({ message: 'Solicitud no autorizada' });
  }

  return next();
};

module.exports = validarFirmaWhatsapp;
