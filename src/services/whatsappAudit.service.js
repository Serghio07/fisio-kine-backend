const { AuditoriaWhatsapp } = require('../models');
const {
  maskPhone,
  partialMessageId,
  summarizeText
} = require('../utils/whatsapp');

const auditWhatsapp = async ({
  conversationId = null,
  action,
  channel = 'WHATSAPP',
  previousState = null,
  newState = null,
  process,
  messageId = null,
  result,
  error = null,
  phone = null,
  data = {}
}) => {
  try {
    return await AuditoriaWhatsapp.create({
      conversacion_id: conversationId,
      accion: action,
      canal: channel,
      estado_anterior: previousState,
      estado_nuevo: newState,
      proceso: process,
      message_id_externo: messageId,
      resultado: result,
      error_resumido: summarizeText(error),
      datos: {
        ...data,
        telefono_enmascarado: maskPhone(phone),
        message_id_parcial: partialMessageId(messageId)
      }
    });
  } catch (auditError) {
    console.warn('No se pudo registrar auditoria de WhatsApp:', summarizeText(auditError.message, 120));
    return null;
  }
};

module.exports = { auditWhatsapp };
