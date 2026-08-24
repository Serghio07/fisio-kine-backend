const { WhatsappEvento, WhatsappAppointmentReminder, WhatsappReceptionReply } = require('../models');
const { sendTextMessage } = require('./whatsapp.service');
const { CONTACT_TYPES, identifyWhatsappContact } = require('./whatsappPatient.service');
const { processConversationMessage, RESPONSES: CONVERSATION_RESPONSES } = require('./whatsappConversation.service');
const whatsappNotificationTrigger = require('./whatsappNotificationTrigger.service');
const monitoringIncidents=require('./whatsappIncident.service');

const WELCOME_MESSAGE = `Hola, soy el asistente virtual de Physio Active. 👋

Recibimos tu mensaje correctamente.

En el siguiente paso podrás:
1. Agendar una cita
2. Consultar una cita
3. Reprogramar o cancelar
4. Hablar con recepción

Por ahora, esta es una prueba de conexión del asistente.`;

const NON_TEXT_MESSAGE = 'Por el momento solo puedo procesar mensajes de texto. Por favor, escríbeme tu consulta.';

const NEW_CONTACT_MESSAGE = `Hola, soy el asistente virtual de Physio Active. 👋

No encontramos un paciente registrado con este número.

Puedes continuar como contacto nuevo para solicitar una cita.

¿Qué deseas realizar?

1. Solicitar una cita
2. Consultar información del centro
3. Hablar con recepción

Responde con el número de una opción.`;

const INTEGRITY_ERROR_MESSAGE = `Hola. 👋

No pudimos validar tu registro debido a una inconsistencia interna.

Por favor, comunícate con recepción para verificar tus datos.`;

const IDENTIFICATION_ERROR_MESSAGE = `Hola. En este momento no pudimos verificar tu registro.

Por favor, intenta nuevamente en unos minutos o comunícate con recepción.`;

const buildExistingPatientMessage = (firstName) => {
  const greeting = firstName ? `Hola, ${firstName}. 👋` : 'Hola. 👋';
  return `${greeting}

Te damos la bienvenida nuevamente a Physio Active.

¿Qué deseas realizar?

1. Agendar una cita
2. Consultar mis citas
3. Reprogramar o cancelar una cita
4. Hablar con recepción

Responde con el número de una opción.`;
};

const selectContactResponse = (identification) => {
  if (identification.type === CONTACT_TYPES.EXISTING) {
    return buildExistingPatientMessage(identification.patient?.firstName);
  }
  if (identification.type === CONTACT_TYPES.INTEGRITY_ERROR) return INTEGRITY_ERROR_MESSAGE;
  if (identification.type === CONTACT_TYPES.NEW) return NEW_CONTACT_MESSAGE;
  return null;
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const isWhatsappBusinessPayload = (payload) => (
  isPlainObject(payload) && payload.object === 'whatsapp_business_account'
);

const extractWebhookData = (payload) => {
  const messages = [];
  const statuses = [];
  let statusesCount = 0;

  if (!isWhatsappBusinessPayload(payload) || !Array.isArray(payload.entry)) {
    return { messages, statusesCount, statuses };
  }

  for (const entry of payload.entry) {
    if (!isPlainObject(entry) || !Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (!isPlainObject(change) || change.field !== 'messages' || !isPlainObject(change.value)) continue;

      const value = change.value;
      if (Array.isArray(value.statuses)) { statusesCount += value.statuses.length; statuses.push(...value.statuses.filter(isPlainObject)); }
      if (!Array.isArray(value.messages)) continue;

      for (const message of value.messages) {
        if (!isPlainObject(message)) continue;
        const contact = Array.isArray(value.contacts)
          ? value.contacts.find((item) => item?.wa_id === message.from) || value.contacts[0]
          : undefined;
        messages.push({
          id: message.id,
          from: message.from,
          type: message.type,
          text: message.type === 'text' && typeof message.text?.body === 'string'
            ? message.text.body
            : undefined,
          timestamp: message.timestamp,
          contactName: contact?.profile?.name,
          phoneNumberId: value.metadata?.phone_number_id,
          displayPhoneNumber: value.metadata?.display_phone_number,
          replyToMessageId: typeof message.context?.id === 'string' ? message.context.id : null,
          field: change.field
        });
      }
    }
  }

  return { messages, statusesCount, statuses };
};

const processDeliveryStatus = async (status, eventModel = WhatsappEvento, reminderModel = WhatsappAppointmentReminder, replyModel = WhatsappReceptionReply) => {
  const messageId = typeof status?.id === 'string' ? status.id.trim() : '';
  const value = String(status?.status || '').toLowerCase();
  if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(value)) return 'ignored';
  const now = status.timestamp && /^\d+$/.test(String(status.timestamp)) ? new Date(Number(status.timestamp) * 1000) : new Date();
  const state = { sent: 'ENVIADO', delivered: 'ENTREGADO', read: 'LEIDO', failed: 'FALLIDO' }[value];
  const reminder = await reminderModel.findOne({ where: { meta_message_id: messageId } });
  if (reminder) {
    const rank = { ACEPTADO: 0, ENVIADO: 1, ENTREGADO: 2, LEIDO: 3 };
    const finalState = ['RESPONDIDO', 'CANCELADO', 'EXPIRADO'].includes(reminder.estado);
    const timestamp = value === 'sent' ? { enviado_en: now } : value === 'delivered' ? { entregado_en: now } : value === 'read' ? { leido_en: now } : {};
    if (finalState && value !== 'failed') await reminder.update(timestamp);
    else if (!finalState && (value === 'failed' || (rank[state] ?? -1) > (rank[reminder.estado] ?? -1))) await reminder.update({ estado: state, ...timestamp, ...(value === 'failed' ? { error_codigo: String(status.errors?.[0]?.code || 'META_DELIVERY_FAILED').slice(0, 100), error_categoria: 'PERMANENTE', error_resumen: 'Meta informó fallo de entrega' } : {}) });
  }
  const reply = await replyModel.findOne({ where: { meta_message_id: messageId } });
  if (reply) {
    const rank = { ACEPTADO_META: 0, ENVIADO: 1, ENTREGADO: 2, LEIDO: 3 };
    const timestamp = value === 'sent' ? { enviado_en: now } : value === 'delivered' ? { entregado_en: now } : value === 'read' ? { leido_en: now } : {};
    if (value === 'failed' || (rank[state] ?? -1) > (rank[reply.estado] ?? -1)) { await reply.update({ estado: state, ...timestamp, ...(value === 'failed' ? { fallido_en: now, error_codigo: String(status.errors?.[0]?.code || 'META_DELIVERY_FAILED').slice(0, 100), error_categoria: 'PERMANENTE', error_resumen: 'Meta informó fallo de entrega' } : {}) }); if (value === 'failed') await whatsappNotificationTrigger.manualReplyFailed(reply); }
  }
  const event = await eventModel.findOne({ where: { meta_message_id: messageId } });
  if (event) await event.update({ estado: state, ...(value === 'sent' ? { enviado_en: now } : {}), ...(value === 'delivered' ? { entregado_en: now } : {}), ...(value === 'read' ? { leido_en: now } : {}), ...(value === 'failed' ? { error_codigo: String(status.errors?.[0]?.code || 'META_DELIVERY_FAILED').slice(0, 100), error_detalle: 'Meta informó fallo de entrega' } : {}) });
  return reminder || reply || event ? 'updated' : 'unknown';
};

const buildMinimalIncomingEvent = (message) => {
  if (!isPlainObject(message)) return null;

  const metaMessageId = typeof message.id === 'string' ? message.id.trim() : '';
  const telefono = typeof message.from === 'string' ? message.from.trim() : '';
  if (!metaMessageId || metaMessageId.length > 255) return null;
  if (!/^\d{5,30}$/.test(telefono)) return null;

  const datos = {};
  if (typeof message.type === 'string' && message.type.length <= 50) datos.message_type = message.type;
  if (typeof message.timestamp === 'string' && message.timestamp.length <= 30) datos.meta_timestamp = message.timestamp;
  if (typeof message.phoneNumberId === 'string' && message.phoneNumberId.length <= 100) datos.phone_number_id = message.phoneNumberId;
  if (typeof message.displayPhoneNumber === 'string' && message.displayPhoneNumber.length <= 30) {
    datos.display_phone_number = message.displayPhoneNumber;
  }
  if (typeof message.field === 'string' && message.field.length <= 50) datos.field = message.field;

  return {
    meta_message_id: metaMessageId,
    solicitud_id: null,
    cita_id: null,
    telefono,
    direccion: 'ENTRANTE',
    tipo_evento: 'MENSAJE_RECIBIDO',
    estado: 'RECIBIDO',
    datos,
    procesado_en: null,
    enviado_en: null,
    entregado_en: null,
    leido_en: null
  };
};

const registerIncomingEvent = async (eventData, eventModel = WhatsappEvento) => {
  try {
    await eventModel.create(eventData);
    return 'created';
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return 'duplicate';
    if (error?.name === 'SequelizeValidationError') return 'invalid';
    throw error;
  }
};

const buildOutgoingEvent = (message, sendResult, responseKind, contactType, conversationStep) => ({
  meta_message_id: sendResult.messageId,
  solicitud_id: null,
  cita_id: null,
  telefono: message.from.trim(),
  direccion: 'SALIENTE',
  tipo_evento: 'CONFIRMACION_ENVIADA',
  estado: 'ENVIADO',
  datos: {
    response_kind: responseKind,
    contact_type: contactType,
    conversation_step: conversationStep,
    recipient_type: 'individual',
    messaging_product: sendResult.data?.messagingProduct || 'whatsapp'
  },
  procesado_en: null,
  enviado_en: new Date(),
  entregado_en: null,
  leido_en: null
});

const buildSendErrorEvent = (message, sendResult, responseKind, contactType, conversationStep) => ({
  meta_message_id: null,
  solicitud_id: null,
  cita_id: null,
  telefono: message.from.trim(),
  direccion: 'SALIENTE',
  tipo_evento: 'ERROR_ENVIO',
  estado: 'FALLIDO',
  error_codigo: String(sendResult.code || 'UNKNOWN_ERROR').slice(0, 100),
  error_detalle: String(sendResult.message || 'Error de envio').slice(0, 500),
  datos: {
    response_kind: responseKind,
    contact_type: contactType,
    conversation_step: conversationStep,
    http_status: Number.isInteger(sendResult.status) ? sendResult.status : 0,
    error_type: typeof sendResult.type === 'string' ? sendResult.type : undefined
  },
  procesado_en: null,
  enviado_en: null,
  entregado_en: null,
  leido_en: null
});

const processIncomingMessage = async (message, options) => {
  console.info('[WhatsApp] Mensaje entrante recibido');
  const eventData = buildMinimalIncomingEvent(message);
  if (!eventData) {
    console.warn('[WhatsApp] No se pudo identificar un número válido del remitente');
    return 'invalid';
  }

  const registration = await registerIncomingEvent(eventData, options.eventModel);
  if (registration !== 'created') {
    if (registration === 'duplicate') { console.info('[WhatsApp] Evento duplicado ignorado'); if(typeof options.eventModel.findOne==='function'){const existing=await options.eventModel.findOne({where:{meta_message_id:eventData.meta_message_id},attributes:['id']});if(existing)await monitoringIncidents.createOrIncrement({type:'WEBHOOK_DUPLICADO',severity:'INFO',entityType:'EVENTO',entityId:existing.id,eventId:existing.id,code:'DUPLICATE',summary:'Evento ignorado por idempotencia',category:'DESCONOCIDO',recoverable:false,idempotencyKey:`duplicate-event:${existing.id}`}).catch(()=>{});} }
    return registration;
  }
  await (options.notificationTrigger?.patientReply || whatsappNotificationTrigger.patientReply)({ phone: message.from, metaMessageId: message.id });

  const isTextMessage = message.type === 'text' && typeof message.text === 'string';
  let response;
  try {
    response = await options.processConversationMessage({
      phone: message.from,
      message: isTextMessage ? message.text : undefined,
      isText: isTextMessage,
      nonTextMessage: NON_TEXT_MESSAGE,
      identificationResponse: selectContactResponse,
      replyToMessageId: message.replyToMessageId
    }, { identifyWhatsappContact: options.identifyWhatsappContact });
  } catch (_) {
    console.error('[WhatsApp] Error al procesar conversación');
    response = { responseText: CONVERSATION_RESPONSES.ERROR, responseKind: 'CONVERSATION_ERROR' };
  }

  const { responseText, responseKind, contactType, conversationStep } = response || {};

  if (!responseText) return 'invalid';
  const sendResult = await options.sendTextMessage(message.from, responseText);

  if (sendResult.success) {
    await options.eventModel.create(buildOutgoingEvent(message, sendResult, responseKind, contactType, conversationStep));
    console.info('[WhatsApp] Respuesta conversacional enviada');
    return 'replied';
  }

  await options.eventModel.create(buildSendErrorEvent(message, sendResult, responseKind, contactType, conversationStep));
  return 'send_failed';
};

const processWebhookPayload = async (payload, options = {}) => {
  const { messages, statusesCount, statuses } = extractWebhookData(payload);
  const injectedIdentificationAdapter = options.identifyWhatsappContact && !options.processConversationMessage
    ? async (input) => {
      if (!input.isText) return { responseText: input.nonTextMessage, responseKind: 'UNSUPPORTED_MESSAGE_TYPE' };
      const identification = await options.identifyWhatsappContact(input.phone);
      return {
        responseText: selectContactResponse(identification),
        responseKind: 'CONTACT_IDENTIFICATION',
        contactType: identification.type
      };
    }
    : null;
  const dependencies = {
    eventModel: options.eventModel || WhatsappEvento,
    sendTextMessage: options.sendTextMessage || sendTextMessage,
    identifyWhatsappContact: options.identifyWhatsappContact || identifyWhatsappContact,
    processConversationMessage: options.processConversationMessage || injectedIdentificationAdapter || processConversationMessage,
    notificationTrigger: options.notificationTrigger
  };
  const reminderModel = options.reminderModel || WhatsappAppointmentReminder;
  const result = {
    relevant: isWhatsappBusinessPayload(payload),
    receivedMessages: messages.length,
    replied: 0,
    duplicates: 0,
    invalid: 0,
    sendFailures: 0,
    statuses: statusesCount
  };

  const replyModel = options.replyModel || WhatsappReceptionReply;
  for (const status of statuses) { const processed=await processDeliveryStatus(status, dependencies.eventModel, reminderModel, replyModel);if(processed==='unknown'&&dependencies.eventModel===WhatsappEvento){const token=monitoringIncidents.hash(status.id);await monitoringIncidents.createOrIncrement({type:'CALLBACK_DESCONOCIDO',severity:'WARNING',entityType:'WEBHOOK',entityRef:status.id,code:String(status.status||'UNKNOWN').slice(0,100),summary:'Callback sin entidad conocida',category:'DESCONOCIDO',recoverable:false,idempotencyKey:`unknown-callback:${token}:${String(status.status||'unknown')}`}).catch(()=>{});} }

  for (const message of messages) {
    const processing = await processIncomingMessage(message, dependencies);
    if (processing === 'replied') result.replied += 1;
    else if (processing === 'duplicate') result.duplicates += 1;
    else if (processing === 'send_failed') result.sendFailures += 1;
    else result.invalid += 1;
  }

  return result;
};

module.exports = {
  WELCOME_MESSAGE,
  NON_TEXT_MESSAGE,
  NEW_CONTACT_MESSAGE,
  INTEGRITY_ERROR_MESSAGE,
  IDENTIFICATION_ERROR_MESSAGE,
  buildExistingPatientMessage,
  selectContactResponse,
  isWhatsappBusinessPayload,
  extractWebhookData,
  buildMinimalIncomingEvent,
  buildOutgoingEvent,
  buildSendErrorEvent,
  registerIncomingEvent,
  processIncomingMessage,
  processDeliveryStatus,
  processWebhookPayload
};
