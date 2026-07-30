const { Op } = require('sequelize');
const {
  sequelize,
  ConversacionWhatsapp,
  MensajeWhatsapp
} = require('../models');
const {
  isTestNumberAllowed
} = require('../config/whatsapp');
const {
  detectOrigin,
  extractWebhookEvents,
  summarizeText,
  stripWebReference,
  maskPhone,
  partialMessageId
} = require('../utils/whatsapp');
const whatsappApi = require('./whatsapp.service');
const { auditWhatsapp } = require('./whatsappAudit.service');

const WELCOME_MESSAGE = `Hola \u{1F44B} Bienvenido a Physio Active.

Te ayudaremos a reservar tu cita.

\u00BFPara qui\u00E9n deseas realizar la reserva?

1. Para m\u00ED
2. Para otra persona`;

const statusDates = {
  sent: 'fecha_envio',
  delivered: 'fecha_entrega',
  read: 'fecha_lectura',
  failed: 'fecha_error'
};

const findActiveConversation = (phone, transaction) => ConversacionWhatsapp.findOne({
  where: { telefono: phone, estado: { [Op.in]: ['INICIADA', 'ACTIVA'] } },
  order: [['fecha_ultima_interaccion', 'DESC']],
  transaction
});

const findOrCreateConversation = async (message, origin, transaction) => {
  let conversation = await findActiveConversation(message.from, transaction);
  if (!conversation) {
    conversation = await ConversacionWhatsapp.create({
      telefono: message.from,
      origen_conversacion: origin.origin,
      referencia_origen: origin.reference,
      estado_flujo: 'INICIADA',
      ultimo_paso: 'BIENVENIDA',
      fecha_inicio: message.date,
      fecha_ultima_interaccion: message.date,
      estado: 'ACTIVA'
    }, { transaction });
  } else {
    const updates = { fecha_ultima_interaccion: message.date, estado: 'ACTIVA' };
    if (origin.reference && !conversation.referencia_origen) {
      updates.origen_conversacion = origin.origin;
      updates.referencia_origen = origin.reference;
    }
    await conversation.update(updates, { transaction });
  }
  return conversation;
};

const registerOutgoingMessage = async (conversation, phone, sendText = whatsappApi.sendTextMessage) => {
  const outgoing = await MensajeWhatsapp.create({
    conversacion_id: conversation.id,
    direccion: 'SALIENTE',
    tipo: 'text',
    contenido_resumido: summarizeText(WELCOME_MESSAGE),
    estado_envio: 'PENDIENTE'
  });

  try {
    const result = await sendText(phone, WELCOME_MESSAGE, { maxAttempts: 2 });
    await outgoing.update({
      message_id_externo: result.summary.messageId,
      estado_envio: 'ENVIADO',
      fecha_envio: new Date(),
      respuesta_api_resumida: result.summary,
      reintentos: Math.max(Number(result.attempts || 1) - 1, 0)
    });
    await auditWhatsapp({
      conversationId: conversation.id,
      action: 'MENSAJE_SALIENTE',
      channel: conversation.origen_conversacion,
      process: 'ENVIO',
      messageId: result.summary.messageId,
      result: 'ENVIADO',
      phone,
      data: { estado_envio: 'ENVIADO' }
    });
    return { sent: true, messageId: result.summary.messageId };
  } catch (error) {
    await outgoing.update({
      estado_envio: 'ERROR',
      fecha_error: new Date(),
      codigo_error: summarizeText(error.code, 80),
      error_resumido: summarizeText(error.message),
      respuesta_api_resumida: error.apiSummary || { success: false },
      reintentos: Math.max(Number(error.attempts || 1) - 1, 0)
    });
    await auditWhatsapp({
      conversationId: conversation.id,
      action: 'MENSAJE_SALIENTE',
      channel: conversation.origen_conversacion,
      process: 'ENVIO',
      result: 'ERROR',
      error: error.code || error.message,
      phone,
      data: { estado_envio: 'ERROR' }
    });
    console.warn('No se pudo enviar la bienvenida de WhatsApp:', summarizeText(error.code || 'ERROR', 80));
    return { sent: false, error: summarizeText(error.code || 'ERROR', 80) };
  }
};

const processInboundMessage = async (message, dependencies = {}) => {
  if (!message.externalId || !message.from) return { ignored: true, reason: 'INVALID_MESSAGE' };

  const origin = detectOrigin(message.text);
  if (!isTestNumberAllowed(message.from)) {
    await auditWhatsapp({
      action: 'NUMERO_NO_AUTORIZADO',
      channel: origin.origin,
      process: 'RECEPCION',
      messageId: message.externalId,
      result: 'IGNORADO',
      phone: message.from,
      data: { motivo: 'TEST_NUMBER_NOT_ALLOWED', origen: origin.origin }
    });
    console.info(
      'Webhook de WhatsApp ignorado por lista blanca:',
      maskPhone(message.from),
      partialMessageId(message.externalId)
    );
    return { recorded: false, replied: false, reason: 'TEST_NUMBER_NOT_ALLOWED', origin };
  }

  const existing = await MensajeWhatsapp.findOne({
    where: { message_id_externo: message.externalId }
  });
  if (existing) {
    await auditWhatsapp({
      conversationId: existing.conversacion_id,
      action: 'MENSAJE_DUPLICADO',
      process: 'IDEMPOTENCIA',
      messageId: message.externalId,
      result: 'IGNORADO',
      phone: message.from
    });
    console.info('Webhook de WhatsApp duplicado ignorado:', partialMessageId(message.externalId));
    return { duplicate: true, messageId: message.externalId };
  }

  let conversation;
  try {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:phone))',
        { replacements: { phone: message.from }, transaction }
      );
      const duplicate = await MensajeWhatsapp.findOne({
        where: { message_id_externo: message.externalId },
        transaction
      });
      if (duplicate) return;
      conversation = await findOrCreateConversation(message, origin, transaction);
      await MensajeWhatsapp.create({
        conversacion_id: conversation.id,
        message_id_externo: message.externalId,
        direccion: 'ENTRANTE',
        tipo: message.type,
        contenido_resumido: stripWebReference(message.text),
        estado_envio: 'RECIBIDO',
        fecha_recepcion: message.date
      }, { transaction });
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return { duplicate: true, messageId: message.externalId };
    }
    throw error;
  }
  if (!conversation) return { duplicate: true, messageId: message.externalId };
  await auditWhatsapp({
    conversationId: conversation.id,
    action: 'MENSAJE_ENTRANTE',
    channel: origin.origin,
    process: 'RECEPCION',
    messageId: message.externalId,
    result: 'PROCESADO',
    phone: message.from,
    data: { origen: origin.origin, referencia_detectada: Boolean(origin.reference) }
  });

  const response = await registerOutgoingMessage(
    conversation,
    message.from,
    dependencies.sendTextMessage
  );
  return { recorded: true, replied: response.sent, origin, conversationId: conversation.id };
};

const processMessageStatus = async (status) => {
  if (!status.externalId || !statusDates[status.status]) return { ignored: true };
  const message = await MensajeWhatsapp.findOne({
    where: { message_id_externo: status.externalId }
  });
  if (!message) return { ignored: true, reason: 'MESSAGE_NOT_FOUND' };

  const updates = {
    estado_envio: status.status.toUpperCase(),
    [statusDates[status.status]]: status.date
  };
  if (status.status === 'failed') {
    updates.codigo_error = status.errorCode || null;
    updates.error_resumido = status.errorMessage || null;
  }
  const previousState = message.estado_envio;
  await message.update(updates);
  await auditWhatsapp({
    conversationId: message.conversacion_id,
    action: 'ESTADO_MENSAJE',
    process: 'ESTADO',
    messageId: status.externalId,
    previousState,
    newState: status.status.toUpperCase(),
    result: status.status === 'failed' ? 'ERROR' : 'ACTUALIZADO',
    error: status.errorCode || status.errorMessage,
    data: { estado: status.status }
  });
  return { updated: true, status: status.status };
};

const processWebhookEvent = async (payload, dependencies = {}) => {
  const events = extractWebhookEvents(payload);
  const results = [];
  for (const status of events.statuses) results.push(await processMessageStatus(status));
  for (const message of events.messages) results.push(await processInboundMessage(message, dependencies));
  return { messages: events.messages.length, statuses: events.statuses.length, results };
};

const queueWebhookEvent = (payload) => {
  setImmediate(() => {
    processWebhookEvent(payload).catch((error) => {
      console.error('Error procesando evento de WhatsApp:', summarizeText(error.message));
    });
  });
};

module.exports = {
  WELCOME_MESSAGE,
  processWebhookEvent,
  processInboundMessage,
  processMessageStatus,
  queueWebhookEvent,
  registerOutgoingMessage
};
