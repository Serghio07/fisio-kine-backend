const {
  ConversacionWhatsapp,
  MensajeWhatsapp,
  AuditoriaWhatsapp,
  Paciente,
  Cita
} = require('../models');
const {
  safeTemporaryData,
  protectedPatientName,
  startConversation,
  processConversationMessage,
  resetConversation
} = require('../services/whatsappConversation.service');
const { maskPhone } = require('../utils/whatsapp');

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Identificador de conversacion no valido.');
  return id;
};

const getConversationSnapshot = async (id) => {
  const conversation = await ConversacionWhatsapp.findByPk(parseId(id));
  if (!conversation) return null;
  const patient = conversation.paciente_id
    ? await Paciente.findByPk(conversation.paciente_id, {
      attributes: ['id', 'nombres', 'apellidos']
    })
    : null;
  const createdAppointment = await Cita.findOne({
    where: { whatsapp_conversation_id: conversation.id },
    attributes: ['id', 'estado'],
    order: [['id', 'DESC']]
  });
  return {
    id: conversation.id,
    telefono_enmascarado: maskPhone(conversation.telefono),
    origen: conversation.origen_conversacion === 'WEB' ? 'WEB_WHATSAPP' : 'WHATSAPP',
    estado: conversation.estado,
    paso_actual: conversation.ultimo_paso,
    paciente: patient ? { id: patient.id, nombre: protectedPatientName(patient) } : null,
    paciente_verificado: Boolean(conversation.datos_temporales?.paciente_verificado),
    intentos_verificacion: conversation.intentos_verificacion,
    reserva_temporal_activa: null,
    cita_creada: createdAppointment ? { id: createdAppointment.id, estado: createdAppointment.estado } : null,
    datos_temporales: safeTemporaryData(conversation.datos_temporales),
    fecha_inicio: conversation.fecha_inicio,
    fecha_ultima_interaccion: conversation.fecha_ultima_interaccion
  };
};

const getMessages = (conversationId) => MensajeWhatsapp.findAll({
  where: { conversacion_id: parseId(conversationId) },
  attributes: [
    'id', 'message_id_externo', 'direccion', 'tipo', 'contenido_resumido',
    'estado_envio', 'fecha_recepcion', 'fecha_envio', 'fecha_entrega',
    'fecha_lectura', 'fecha_error', 'codigo_error', 'created_at'
  ],
  order: [['id', 'ASC']]
});

const getAudit = (conversationId) => AuditoriaWhatsapp.findAll({
  where: { conversacion_id: parseId(conversationId) },
  attributes: [
    'id', 'accion', 'canal', 'estado_anterior', 'estado_nuevo',
    'proceso', 'resultado', 'error_resumido', 'datos', 'created_at'
  ],
  order: [['id', 'DESC']],
  limit: 50
});

const badRequest = (res, error) => res.status(400).json({ message: error.message });

const start = async (req, res, next) => {
  try {
    const response = await startConversation(req.body);
    return res.status(201).json({
      response,
      conversation: await getConversationSnapshot(response.conversacionId),
      messages: await getMessages(response.conversacionId),
      audit: await getAudit(response.conversacionId)
    });
  } catch (error) {
    if (/telefono|origen|valido/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

const message = async (req, res, next) => {
  try {
    const response = await processConversationMessage({
      messageId: req.body.messageId,
      telefono: req.body.telefono,
      contenido: req.body.contenido,
      tipo: req.body.tipo,
      origen: req.body.origen,
      fecha: req.body.fecha ? new Date(req.body.fecha) : new Date(),
      conversacionId: req.body.conversacionId
    });
    return res.json({
      response,
      conversation: await getConversationSnapshot(response.conversacionId),
      messages: await getMessages(response.conversacionId),
      audit: await getAudit(response.conversacionId)
    });
  } catch (error) {
    if (/obligatorio|vacio|superar|valido|encontrada|activa/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

const reset = async (req, res, next) => {
  try {
    const response = await resetConversation({
      conversacionId: req.body.conversacionId,
      telefono: req.body.telefono,
      origen: req.body.origen
    });
    return res.json({
      response,
      conversation: await getConversationSnapshot(response.conversacionId),
      messages: await getMessages(response.conversacionId),
      audit: await getAudit(response.conversacionId)
    });
  } catch (error) {
    if (/telefono|origen|valido|encontrada/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

const conversation = async (req, res, next) => {
  try {
    const data = await getConversationSnapshot(req.params.id);
    if (!data) return res.status(404).json({ message: 'Conversacion no encontrada.' });
    return res.json(data);
  } catch (error) {
    if (/Identificador/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

const messages = async (req, res, next) => {
  try {
    return res.json(await getMessages(req.params.id));
  } catch (error) {
    if (/Identificador/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

const audit = async (req, res, next) => {
  try {
    return res.json(await getAudit(req.params.id));
  } catch (error) {
    if (/Identificador/i.test(error.message)) return badRequest(res, error);
    return next(error);
  }
};

module.exports = {
  start,
  message,
  reset,
  conversation,
  messages,
  audit,
  getConversationSnapshot,
  getMessages,
  getAudit
};
