const sequelize = require('../config/database');
const { getConversationTimeoutMinutes } = require('../config/whatsapp');
const { normalizePhoneNumber } = require('../utils/phone');
const { identifyWhatsappContact } = require('./whatsappPatient.service');
const {
  WhatsappConversacion, CONVERSATION_STATUS, CONVERSATION_STEPS, MAIN_OPTIONS, CONTACT_TYPES
} = require('../models/WhatsappConversacion');
const { WhatsappSolicitudCita } = require('../models/WhatsappSolicitudCita');
const { Cita, Paciente, Contacto, PacienteContacto, WhatsappAppointmentReminder } = require('../models');
const {
  MESSAGES: REQUEST_MESSAGES, appointmentSteps, buildStepHelp, processAppointmentStep, sanitizeFirstName
} = require('./whatsappAppointmentRequest.service');
const availabilityDefault = require('./appointmentAvailability.service');
const { availabilitySteps, help: availabilityHelp, offerAvailability, processAvailabilityStep, cancelAvailabilityRequest } = require('./whatsappAvailability.service');
const { confirmationSteps, processFinalConfirmation, ERROR_MESSAGE: FINAL_CONFIRMATION_ERROR } = require('./whatsappAppointmentConfirmation.service');
const { managementSteps, processManagementStep, help: managementHelp, QUERY_ERROR: MANAGEMENT_QUERY_ERROR, UPDATE_ERROR: MANAGEMENT_ERROR } = require('./whatsappAppointmentManagement.service');
const { reminderSteps, processReminderResponse, help: reminderHelp } = require('./whatsappReminderResponse.service');
const { steps: newPatientSteps, processNewPatientStep } = require('./whatsappNewPatient.service');
const { createOrReuseReceptionReferral } = require('./whatsappReceptionReferral.service');
const { syncAppointmentById } = require('./googleCalendarSync.service');

const NEW_CONTACT_MENU = `¡Hola! 👋
Bienvenido a Physio Active.

¿Cómo podemos ayudarte?

1. Agendar una cita
2. Hablar con recepción

Elige una opción escribiendo su número.`;

const buildExistingMenu = (firstName = '') => `${firstName ? `¡Hola, ${firstName}! 👋` : '¡Hola! 👋'}
Qué gusto tenerte nuevamente en Physio Active.

¿Cómo podemos ayudarte hoy?

1. Agendar una cita
2. Ver mis próximas citas
3. Reprogramar o cancelar
4. Hablar con recepción

Elige una opción escribiendo su número.`;

const buildPatientSelectionMessage = (options = []) => `¿Para quién desea realizar la gestión?\n\n${options.map((item, index) => `${index + 1}. ${item.displayName}${item.source === 'PACIENTE' ? ' — Yo' : item.relationship ? ` — ${item.relationship}` : ''}`).join('\n')}\n\nResponda con el número.`;
const safeSelectionOptions = (options = []) => options.map((item) => ({ patientId: Number(item.patientId), displayName: String(item.displayName || '').slice(0, 150), firstName: sanitizeFirstName(item.firstName || item.displayName), source: item.source, contactId: item.contactId ? Number(item.contactId) : null, relationship: item.relationship || null }));
const selectedContext = (option) => ({ patient_reference: { id: option.patientId, first_name: option.firstName }, selected_patient: option });
const reminderReplyLike = (value) => /^(?:1|2|3|4|si|sí|confirmar|confirmo|no|reprogramar)$/iu.test(String(value || '').trim());
const reminderSelectionMessage = (options) => `Encontré más de una cita pendiente. ¿A cuál desea responder?\n\n${options.map((item, index) => `${index + 1}. ${item.patientName} — ${item.date} ${item.time}`).join('\n')}\n\nResponda con el número.`;

const RESPONSES = Object.freeze({
  BOOK_EXISTING: `Perfecto. Iniciaremos el proceso para agendar una cita. 📅

En la siguiente etapa te pediremos la información necesaria para buscar horarios disponibles.

Por ahora, escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  BOOK_NEW: `Perfecto. Iniciaremos tu solicitud de cita. 📅

En la siguiente etapa te pediremos tus datos básicos y la información necesaria para buscar un horario.

Todavía no se creó una cita ni un registro de paciente.

Escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  APPOINTMENTS: `Seleccionaste consultar tus citas. 📋

Esta opción será habilitada en una etapa posterior.

Por ahora, escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  RESCHEDULE: `Seleccionaste reprogramar o cancelar una cita. 📅

Esta opción será habilitada en una etapa posterior.

Por ahora, escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  RECEPTION_EXISTING: `Entendido. Un miembro de recepción deberá continuar con tu solicitud. 👩‍💼

Tu mensaje quedó registrado para atención manual.

Por ahora, escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  RECEPTION_NEW: `Entendido. Un miembro de recepción deberá continuar con tu solicitud. 👩‍💼

Tu selección quedó registrada para atención manual.

Escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  CENTER_INFO: `Physio Active atiende en los siguientes horarios:

Lunes a viernes:
09:00 a 12:30
15:00 a 19:30

Sábados:
09:00 a 12:30

Domingos:
Sin atención.

Escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  CANCELLED: `Listo, cancelamos esta operación.

No se realizó ningún cambio.

Escribe MENÚ para volver al inicio.`,
  CONTINUATION: `Este flujo continuará en la siguiente etapa.

Por ahora, escribe MENÚ para volver al inicio o CANCELAR para terminar la conversación.`,
  TOO_MANY_INVALID: `No logramos identificar una opción válida.

Escribe MENÚ para comenzar nuevamente o CANCELAR para terminar.`,
  ERROR: `Tuvimos un pequeño inconveniente.

Por favor, inténtalo nuevamente en unos minutos.`
});

const buildMainMenu = (contactType, firstName = '') => contactType === CONTACT_TYPES.EXISTING
  ? buildExistingMenu(firstName) : NEW_CONTACT_MENU;

const buildInvalidOptionMessage = (contactType) => contactType === CONTACT_TYPES.EXISTING
  ? `No pude reconocer esa opción 😊

Elige uno de los números mostrados:

1. Agendar una cita
2. Ver mis próximas citas
3. Reprogramar o cancelar
4. Hablar con recepción
`
  : `No pude reconocer esa opción 😊

Elige uno de los números mostrados:

1. Agendar una cita
2. Hablar con recepción.`;

const stripAccents = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizeMenuOption = (value) => {
  if (typeof value !== 'string' || value.length > 100) return { valid: false, option: null };
  const text = stripAccents(value.trim().toLowerCase());
  const match = text.match(/^(?:opcion\s+)?([1-4])\.?$/);
  if (match) return { valid: true, option: Number(match[1]) };
  const words = { uno: 1, dos: 2, tres: 3, cuatro: 4 };
  return words[text] ? { valid: true, option: words[text] } : { valid: false, option: null };
};

const normalizeCommand = (value) => {
  if (typeof value !== 'string' || value.length > 30) return '';
  const command = stripAccents(value.trim().toUpperCase());
  if (command === 'CAMBIAR PACIENTE') return 'CAMBIAR_PACIENTE';
  if (['MENU', 'INICIO', 'REINICIAR', 'CANCELAR', 'SALIR', 'AYUDA'].includes(command)) return command;
  return '';
};
const normalizeGreeting = (value) => {
  if (typeof value !== 'string' || value.length > 50) return false;
  const greeting = stripAccents(value.trim().replace(/\s+/g, ' ').toUpperCase());
  return ['HOLA', 'HOLI', 'BUENAS', 'BUEN DIA', 'BUENAS TARDES', 'BUENAS NOCHES'].includes(greeting);
};

const expiresAt = (now, timeoutMinutes) => new Date(now.getTime() + timeoutMinutes * 60000);
const activity = (now, timeoutMinutes) => ({ ultimo_mensaje_en: now, expira_en: expiresAt(now, timeoutMinutes) });

const selectionFor = (contactType, option, firstName = '') => {
  const existing = {
    1: [CONVERSATION_STEPS.WAITING_REASON, MAIN_OPTIONS.BOOK, REQUEST_MESSAGES.START_EXISTING(firstName)],
    2: [CONVERSATION_STEPS.START_APPOINTMENTS, MAIN_OPTIONS.APPOINTMENTS, RESPONSES.APPOINTMENTS],
    3: [CONVERSATION_STEPS.START_RESCHEDULE_CANCEL, MAIN_OPTIONS.RESCHEDULE_CANCEL, RESPONSES.RESCHEDULE],
    4: [CONVERSATION_STEPS.RECEPTION, MAIN_OPTIONS.RECEPTION, RESPONSES.RECEPTION_EXISTING]
  };
  const fresh = {
    1: [CONVERSATION_STEPS.WAITING_PATIENT_TYPE, MAIN_OPTIONS.BOOK, '¿La atención es para usted o para otra persona?\n\n1. Para mí\n2. Para otra persona'],
    2: [CONVERSATION_STEPS.RECEPTION, MAIN_OPTIONS.RECEPTION, RESPONSES.RECEPTION_NEW]
  };
  return (contactType === CONTACT_TYPES.EXISTING ? existing : fresh)[option] || null;
};

const processConversationMessage = async (input, dependencies = {}) => {
  const phone = normalizePhoneNumber(input.phone);
  if (!phone) return { responseText: null, responseKind: 'INVALID_PHONE' };
  const model = dependencies.conversationModel || WhatsappConversacion;
  const db = dependencies.sequelize || sequelize;
  const identify = dependencies.identifyWhatsappContact || identifyWhatsappContact;
  const requestModel = dependencies.requestModel || WhatsappSolicitudCita;
  const availability = dependencies.availabilityService || availabilityDefault;
  const appointmentModel = dependencies.appointmentModel || Cita;
  const patientModel = dependencies.patientModel || Paciente;
  const contactModel = dependencies.contactModel || Contacto;
  const relationModel = dependencies.relationModel || PacienteContacto;
  const reminderModel = dependencies.reminderModel || WhatsappAppointmentReminder;
  const referralModel = dependencies.referralModel;
  const timeout = dependencies.timeoutMinutes || getConversationTimeoutMinutes();
  const now = dependencies.now ? new Date(dependencies.now) : new Date();

  try {
    const result = await db.transaction(async (transaction) => {
    if (dependencies.useAdvisoryLock !== false) {
      await db.query('SELECT pg_advisory_xact_lock(hashtext(:phone))', { replacements: { phone }, transaction });
    }
    let conversation = await model.findOne({
      where: { telefono: phone, estado: CONVERSATION_STATUS.ACTIVE },
      transaction, lock: transaction.LOCK?.UPDATE
    });

    if (conversation && new Date(conversation.expira_en) <= now) {
      await conversation.update({ estado: CONVERSATION_STATUS.EXPIRED, contexto: {} }, { transaction });
      console.info('[WhatsApp] Conversación expirada');
      conversation = null;
    }

    if (!input.isText) {
      if (conversation) await conversation.update(activity(now, timeout), { transaction });
      return { responseText: input.nonTextMessage, responseKind: 'UNSUPPORTED_MESSAGE_TYPE', contactType: conversation?.tipo_contacto, conversationStep: conversation?.paso_actual };
    }

    if (!conversation) {
      const referencedReminder = input.replyToMessageId && typeof reminderModel.findOne === 'function' ? await reminderModel.findOne({ where: { meta_message_id: input.replyToMessageId, telefono_normalizado: phone }, transaction, lock: transaction.LOCK?.UPDATE }) : null;
      if (referencedReminder && ['ACEPTADO','ENVIADO','ENTREGADO','LEIDO'].includes(referencedReminder.estado) && referencedReminder.expira_respuesta_en && new Date(referencedReminder.expira_respuesta_en) > now) {
        conversation = await model.create({ telefono: phone, paciente_id: referencedReminder.paciente_id, contacto_id: referencedReminder.contacto_id || null, paciente_contexto_id: referencedReminder.paciente_id, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'RECORDATORIO_REFERENCIADO', tipo_contacto: CONTACT_TYPES.EXISTING, estado: CONVERSATION_STATUS.ACTIVE, paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, opcion_principal: null, contexto: { patient_reference: { id: referencedReminder.paciente_id, first_name: '' }, appointment_reminder: { reminder_id: referencedReminder.id, appointment_id: referencedReminder.cita_id, replied_to_message_id: input.replyToMessageId } }, ...activity(now, timeout) }, { transaction });
      }
    }

    if (!conversation && !input.replyToMessageId && reminderReplyLike(input.message) && typeof reminderModel.findAll === 'function') {
      const reminders = await reminderModel.findAll({ where: { telefono_normalizado: phone, estado: ['ACEPTADO','ENVIADO','ENTREGADO','LEIDO'] }, transaction, lock: transaction.LOCK?.UPDATE });
      const valid = reminders.filter((item) => item.expira_respuesta_en && new Date(item.expira_respuesta_en) > now && !item.respondido_en);
      if (valid.length) {
        const patientIds = [...new Set(valid.map((item) => item.paciente_id))];
        const patients = typeof patientModel.findAll === 'function' ? await patientModel.findAll({ where: { id: patientIds, estado: true }, attributes: ['id','nombres','apellidos'], transaction }) : [];
        const names = new Map(patients.map((item) => [Number(item.id), `${item.nombres || ''} ${item.apellidos || ''}`.trim()]));
        const options = valid.map((item) => ({ reminderId: item.id, appointmentId: item.cita_id, patientId: item.paciente_id, contactId: item.contacto_id || null, patientName: names.get(Number(item.paciente_id)) || 'Paciente', date: item.cita_fecha, time: String(item.cita_hora_inicio || '').slice(0, 5) }));
        if (options.length === 1) {
          const selected = options[0];
          conversation = await model.create({ telefono: phone, paciente_id: selected.patientId, contacto_id: selected.contactId, paciente_contexto_id: selected.patientId, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'RECORDATORIO_REFERENCIADO', tipo_contacto: CONTACT_TYPES.EXISTING, estado: CONVERSATION_STATUS.ACTIVE, paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, opcion_principal: null, contexto: { appointment_reminder: { reminder_id: selected.reminderId, appointment_id: selected.appointmentId } }, ...activity(now, timeout) }, { transaction });
        } else {
          conversation = await model.create({ telefono: phone, paciente_id: null, contacto_id: null, paciente_contexto_id: null, contexto_estado: 'SELECCION_REQUERIDA', contexto_seleccionado_en: null, contexto_origen: null, tipo_contacto: CONTACT_TYPES.EXISTING, estado: CONVERSATION_STATUS.ACTIVE, paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_SELECTION, opcion_principal: null, contexto: { reminder_options: options, pending_reminder_response: input.message }, ...activity(now, timeout) }, { transaction });
          return { responseText: reminderSelectionMessage(options), responseKind: 'REMINDER_SELECTION_REQUIRED', contactType: CONTACT_TYPES.EXISTING, conversationStep: conversation.paso_actual };
        }
      }
    }

    if (!conversation) {
      const identification = await identify(phone);
      if (![CONTACT_TYPES.EXISTING, CONTACT_TYPES.NEW].includes(identification.type)) {
        return { responseText: input.identificationResponse(identification), responseKind: 'CONTACT_IDENTIFICATION', contactType: identification.type };
      }
      const options = safeSelectionOptions(identification.options || (identification.patient ? [{ patientId: identification.patient.id, displayName: identification.patient.displayName, firstName: identification.patient.firstName, source: identification.patient.source || 'PACIENTE', contactId: identification.patient.contactId }] : []));
      const selected = options.length === 1 ? options[0] : null;
      conversation = await model.create({
        telefono: phone,
        paciente_id: selected?.patientId || null,
        contacto_id: selected?.contactId || identification.contactId || null,
        paciente_contexto_id: selected?.patientId || null,
        contexto_estado: selected ? 'SELECCIONADO' : options.length > 1 ? 'SELECCION_REQUERIDA' : 'SIN_SELECCION',
        contexto_seleccionado_en: selected ? now : null,
        contexto_origen: selected ? 'AUTO_UNICO' : null,
        tipo_contacto: identification.type,
        estado: CONVERSATION_STATUS.ACTIVE,
        paso_actual: options.length > 1 ? CONVERSATION_STEPS.WAITING_PATIENT_SELECTION : CONVERSATION_STEPS.WAITING_OPTION,
        opcion_principal: null,
        contexto: selected ? selectedContext(selected) : options.length > 1 ? { patient_options: options } : {},
        ...activity(now, timeout)
      }, { transaction });
      console.info('[WhatsApp] Conversación nueva creada');
      return options.length > 1
        ? { responseText: buildPatientSelectionMessage(options), responseKind: 'PATIENT_SELECTION_REQUIRED', contactType: identification.type, conversationStep: conversation.paso_actual }
        : { responseText: buildMainMenu(identification.type, selected?.firstName), responseKind: 'MAIN_MENU', contactType: identification.type, conversationStep: conversation.paso_actual };
    }

    console.info('[WhatsApp] Conversación activa encontrada');
    const command = normalizeCommand(input.message);
    const greeting = normalizeGreeting(input.message);
    if (input.replyToMessageId && typeof reminderModel.findOne === 'function') {
      const referenced = await reminderModel.findOne({ where: { meta_message_id: input.replyToMessageId, telefono_normalizado: phone }, transaction, lock: transaction.LOCK?.UPDATE });
      if (referenced && ['ACEPTADO','ENVIADO','ENTREGADO','LEIDO'].includes(referenced.estado) && referenced.expira_respuesta_en && new Date(referenced.expira_respuesta_en) > now) {
        await conversation.update({ paciente_id: referenced.paciente_id, paciente_contexto_id: referenced.paciente_id, contacto_id: referenced.contacto_id || null, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'RECORDATORIO_REFERENCIADO', paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, contexto: { appointment_reminder: { reminder_id: referenced.id, appointment_id: referenced.cita_id, replied_to_message_id: input.replyToMessageId } }, ...activity(now, timeout) }, { transaction });
        const result = await processReminderResponse({ conversation, message: input.message, reminderModel, appointmentModel, transaction, activity: activity(now, timeout), now });
        return { ...result, contactType: conversation.tipo_contacto };
      }
    }
    if (!reminderSteps.has(conversation.paso_actual) && conversation.paso_actual !== CONVERSATION_STEPS.WAITING_REMINDER_SELECTION && reminderReplyLike(input.message) && typeof reminderModel.findAll === 'function') {
      const pending = (await reminderModel.findAll({ where: { telefono_normalizado: phone, estado: ['ACEPTADO','ENVIADO','ENTREGADO','LEIDO'] }, transaction, lock: transaction.LOCK?.UPDATE })).filter((item) => item.expira_respuesta_en && new Date(item.expira_respuesta_en) > now && !item.respondido_en);
      if (pending.length) {
        const patientIds = [...new Set(pending.map((item) => item.paciente_id))];
        const patients = typeof patientModel.findAll === 'function' ? await patientModel.findAll({ where: { id: patientIds, estado: true }, attributes: ['id','nombres','apellidos'], transaction }) : [];
        const names = new Map(patients.map((item) => [Number(item.id), `${item.nombres || ''} ${item.apellidos || ''}`.trim()]));
        const options = pending.map((item) => ({ reminderId: item.id, appointmentId: item.cita_id, patientId: item.paciente_id, contactId: item.contacto_id || null, patientName: names.get(Number(item.paciente_id)) || 'Paciente', date: item.cita_fecha, time: String(item.cita_hora_inicio || '').slice(0, 5) }));
        if (options.length > 1) {
          await conversation.update({ paciente_id: null, paciente_contexto_id: null, contacto_id: null, contexto_estado: 'SELECCION_REQUERIDA', contexto_seleccionado_en: null, contexto_origen: null, paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_SELECTION, contexto: { reminder_options: options, pending_reminder_response: input.message }, ...activity(now, timeout) }, { transaction });
          return { responseText: reminderSelectionMessage(options), responseKind: 'REMINDER_SELECTION_REQUIRED', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
        }
        const selected = options[0];
        await conversation.update({ paciente_id: selected.patientId, paciente_contexto_id: selected.patientId, contacto_id: selected.contactId, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'RECORDATORIO_REFERENCIADO', paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, contexto: { appointment_reminder: { reminder_id: selected.reminderId, appointment_id: selected.appointmentId } }, ...activity(now, timeout) }, { transaction });
      }
    }
    if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_REMINDER_SELECTION) {
      if (['CANCELAR','SALIR'].includes(command)) { await conversation.update({ estado: CONVERSATION_STATUS.CANCELLED, contexto: {}, ...activity(now, timeout) }, { transaction }); return { responseText: 'Aclaración cancelada. No se modificó ninguna cita.', responseKind: 'REMINDER_SELECTION_CANCELLED', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual }; }
      const options = Array.isArray(conversation.contexto?.reminder_options) ? conversation.contexto.reminder_options : [];
      const selected = options[Number(String(input.message).trim()) - 1];
      if (!selected) return { responseText: `Esa opción no es válida. Responda con ${options.map((_, index) => index + 1).join(' o ')}.`, responseKind: 'INVALID_REMINDER_SELECTION', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
      const originalResponse = conversation.contexto.pending_reminder_response;
      await conversation.update({ paciente_id: selected.patientId, paciente_contexto_id: selected.patientId, contacto_id: selected.contactId, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'SELECCION_USUARIO', paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, contexto: { appointment_reminder: { reminder_id: selected.reminderId, appointment_id: selected.appointmentId } }, ...activity(now, timeout) }, { transaction });
      const result = await processReminderResponse({ conversation, message: originalResponse, reminderModel, appointmentModel, transaction, activity: activity(now, timeout), now });
      return { ...result, contactType: conversation.tipo_contacto };
    }
    if (command === 'CAMBIAR_PACIENTE') {
      const identification = await identify(phone); const options = safeSelectionOptions(identification.options || []);
      if (!options.length) return { responseText: 'No encontramos pacientes autorizados para este número.', responseKind: 'NO_AUTHORIZED_PATIENTS', contactType: conversation.tipo_contacto };
      if (options.length === 1) {
        const selected = options[0]; await conversation.update({ paciente_id: selected.patientId, paciente_contexto_id: selected.patientId, contacto_id: selected.contactId || identification.contactId || null, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'AUTO_UNICO', paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: selectedContext(selected), ...activity(now, timeout) }, { transaction });
        return { responseText: buildExistingMenu(selected.firstName), responseKind: 'PATIENT_AUTO_SELECTED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
      await conversation.update({ paciente_id: null, paciente_contexto_id: null, contacto_id: identification.contactId || null, contexto_estado: 'SELECCION_REQUERIDA', contexto_seleccionado_en: null, contexto_origen: null, paso_actual: CONVERSATION_STEPS.WAITING_PATIENT_SELECTION, opcion_principal: null, contexto: { patient_options: options }, ...activity(now, timeout) }, { transaction });
      return { responseText: buildPatientSelectionMessage(options), responseKind: 'PATIENT_SELECTION_REQUIRED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_PATIENT_SELECTION };
    }
    if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_PATIENT_SELECTION) {
      if (['CANCELAR','SALIR'].includes(command)) {
        await conversation.update({ paciente_id: null, paciente_contexto_id: null, contacto_id: null, contexto_estado: 'SIN_SELECCION', contexto_seleccionado_en: null, contexto_origen: null, paso_actual: CONVERSATION_STEPS.WAITING_OPTION, contexto: {}, ...activity(now, timeout) }, { transaction });
        return { responseText: 'Selección cancelada. Escribe MENÚ para comenzar nuevamente.', responseKind: 'PATIENT_SELECTION_CANCELLED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
      const options = Array.isArray(conversation.contexto?.patient_options) ? conversation.contexto.patient_options : [];
      const index = /^\d+$/.test(String(input.message || '').trim()) ? Number(String(input.message).trim()) - 1 : -1;
      if (!options[index]) return { responseText: `Esa opción no es válida. Responda con ${options.map((_, i) => i + 1).join(', ')}.`, responseKind: 'INVALID_PATIENT_SELECTION', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
      const selected = options[index];
      await conversation.update({ paciente_id: selected.patientId, paciente_contexto_id: selected.patientId, contacto_id: selected.contactId || conversation.contacto_id || null, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'SELECCION_USUARIO', paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: selectedContext(selected), ...activity(now, timeout) }, { transaction });
      return { responseText: buildExistingMenu(selected.firstName), responseKind: 'PATIENT_SELECTED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
    }
    if (conversation.paciente_contexto_id != null) {
      const currentIdentity = await identify(phone);
      const authorized = (currentIdentity.options || []).some((option) => Number(option.patientId) === Number(conversation.paciente_contexto_id));
      if (!authorized) {
        await conversation.update({ paciente_id: null, paciente_contexto_id: null, contacto_id: null, contexto_estado: 'SIN_SELECCION', contexto_seleccionado_en: null, contexto_origen: null, paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: {}, ...activity(now, timeout) }, { transaction });
        return { responseText: 'La autorización para gestionar este paciente ya no está vigente.', responseKind: 'PATIENT_CONTEXT_UNAUTHORIZED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
    }
    if (['MENU', 'INICIO', 'REINICIAR'].includes(command)) {
      if (conversation.contexto?.request_id && ![CONVERSATION_STEPS.APPOINTMENT_CREATED, CONVERSATION_STEPS.REFERRED_RECEPTION].includes(conversation.paso_actual)) {
        await cancelAvailabilityRequest({ conversation, requestModel, transaction, activity: activity(now, timeout), reason: 'Flujo abandonado desde el menú' });
      }
      const patientReference = conversation.contexto?.patient_reference;
      await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: patientReference ? { patient_reference: patientReference } : {}, ...activity(now, timeout) }, { transaction });
      console.info('[WhatsApp] Conversación reiniciada');
      return { responseText: buildMainMenu(conversation.tipo_contacto), responseKind: 'MAIN_MENU', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
    }
    if (['CANCELAR', 'SALIR'].includes(command)) {
      if (managementSteps.has(conversation.paso_actual)) {
        const original = conversation.contexto?.appointment_management?.original_slot;
        const wasRescheduling = [CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT, CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION].includes(conversation.paso_actual);
        const patientReference = conversation.contexto?.patient_reference;
        await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: patientReference ? { patient_reference: patientReference } : {}, ...activity(now, timeout) }, { transaction });
        console.info(wasRescheduling ? '[WhatsApp] Reprogramación cancelada' : '[WhatsApp] Flujo de gestión cancelado');
        return { responseText: wasRescheduling && original ? `Se canceló el proceso de reprogramación.\n\nTu cita original permanece sin cambios:\n\nFecha:\n${new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${original.date}T00:00:00Z`))}\n\nHorario:\n${original.start}${original.end ? ` a ${original.end}` : ''}\n\nEscribe MENÚ para volver al inicio.` : 'Saliste del flujo de citas.\n\nNo se modificó ninguna cita.\n\nEscribe MENÚ para volver al inicio.', responseKind: wasRescheduling ? 'RESCHEDULE_ABORTED' : 'MANAGEMENT_ABORTED', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
      if (conversation.contexto?.request_id) await cancelAvailabilityRequest({ conversation, requestModel, transaction, activity: activity(now, timeout) });
      await conversation.update({ estado: CONVERSATION_STATUS.CANCELLED, contexto: {}, ...activity(now, timeout) }, { transaction });
      console.info('[WhatsApp] Conversación cancelada');
      return { responseText: RESPONSES.CANCELLED, responseKind: 'CONVERSATION_CANCELLED', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
    }
    if (command === 'AYUDA' || (greeting && conversation.paso_actual !== CONVERSATION_STEPS.WAITING_OPTION && Object.values(CONVERSATION_STEPS).includes(conversation.paso_actual))) {
      await conversation.update(activity(now, timeout), { transaction });
      const helpText = reminderSteps.has(conversation.paso_actual) ? reminderHelp(conversation.paso_actual) : managementSteps.has(conversation.paso_actual) ? managementHelp(conversation.paso_actual) : confirmationSteps.has(conversation.paso_actual) ? 'Revisa el resumen y responde con una de las opciones indicadas. También puedes escribir MENÚ o CANCELAR.' : availabilitySteps.has(conversation.paso_actual) ? availabilityHelp(conversation.paso_actual) : appointmentSteps.has(conversation.paso_actual)
        ? buildStepHelp(conversation.paso_actual)
        : `Comandos disponibles: MENÚ, INICIO, REINICIAR, CANCELAR y SALIR.\n\n${buildMainMenu(conversation.tipo_contacto)}`;
      return { responseText: helpText, responseKind: 'HELP', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
    }

    if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_OPTION) {
      let firstName = '';
      if (conversation.tipo_contacto === CONTACT_TYPES.EXISTING) {
        const cached = conversation.contexto?.patient_reference;
        if (cached && conversation.paciente_id != null && cached.id === conversation.paciente_id) {
          firstName = sanitizeFirstName(cached.first_name);
        } else {
          const identification = await identify(phone);
          if (identification.type === CONTACT_TYPES.EXISTING && identification.patient?.id === conversation.paciente_id) {
            firstName = sanitizeFirstName(identification.patient.firstName);
            conversation.contexto = { ...(conversation.contexto || {}), patient_reference: { id: conversation.paciente_id, first_name: firstName } };
          }
        }
      }
      if (greeting) {
        await conversation.update(activity(now, timeout), { transaction });
        return { responseText: buildMainMenu(conversation.tipo_contacto, firstName), responseKind: 'MAIN_MENU', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
      const normalized = normalizeMenuOption(input.message);
      const selection = normalized.valid && selectionFor(conversation.tipo_contacto, normalized.option, firstName);
      if (selection) {
        const [step, option, responseText] = selection;
        const flowContext = firstName
          ? { contact_first_name: firstName, ...(conversation.contexto?.patient_reference ? { patient_reference: conversation.contexto.patient_reference } : {}) }
          : {};
        if (step === CONVERSATION_STEPS.RECEPTION) {
          const referral = await createOrReuseReceptionReferral({ conversation, type: 'CONSULTA_GENERAL', transaction, referralModel, now, db });
          await conversation.update({ paso_actual: step, opcion_principal: option, contexto: flowContext, ...activity(now, timeout) }, { transaction });
          const name = firstName ? `, ${firstName}` : '';
          return { responseText: referral.created ? `Entendido${name}.\n\nTu solicitud quedó pendiente de atención por recepción. ✅\n\nEl personal de Physio Active revisará tu solicitud.\n\nEscribe MENÚ para volver al inicio.` : `Tu solicitud ya se encuentra pendiente de atención por recepción.\n\nEscribe MENÚ para volver al inicio.`, responseKind: referral.created ? 'RECEPTION_REFERRAL_CREATED' : 'RECEPTION_REFERRAL_REUSED', contactType: conversation.tipo_contacto, conversationStep: step };
        }
        await conversation.update({ paso_actual: step, opcion_principal: option, contexto: flowContext, ...activity(now, timeout) }, { transaction });
        console.info('[WhatsApp] Opción principal seleccionada');
        if ([CONVERSATION_STEPS.START_APPOINTMENTS, CONVERSATION_STEPS.START_RESCHEDULE_CANCEL].includes(step)) {
          const currentIdentification = await identify(phone);
          if (currentIdentification.type !== CONTACT_TYPES.EXISTING || currentIdentification.patient?.id !== conversation.paciente_id) {
            return { responseText: 'No encontramos un registro de paciente asociado a este número.\n\nPara consultar, cancelar o reprogramar una cita, comunícate con recepción para verificar tus datos.', responseKind: 'MANAGEMENT_NOT_PATIENT', contactType: conversation.tipo_contacto, conversationStep: step };
          }
          const managementResult = await processManagementStep({ conversation, message: input.message, appointmentModel, patientModel, referralModel, transaction, db, activity: activity(now, timeout), now, availability });
          return { ...managementResult, contactType: conversation.tipo_contacto };
        }
        return { responseText, responseKind: 'MENU_SELECTION', contactType: conversation.tipo_contacto, conversationStep: step };
      }
      const invalidAttempts = Math.min(Number(conversation.contexto?.invalid_attempts || 0) + 1, 3);
      await conversation.update({ contexto: { invalid_attempts: invalidAttempts }, ...activity(now, timeout) }, { transaction });
      console.info('[WhatsApp] Opción inválida');
      return { responseText: invalidAttempts >= 3 ? RESPONSES.TOO_MANY_INVALID : buildInvalidOptionMessage(conversation.tipo_contacto), responseKind: 'INVALID_OPTION', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
    }

    if (reminderSteps.has(conversation.paso_actual)) {
      const result = await processReminderResponse({ conversation, message: input.message, reminderModel, appointmentModel, transaction, activity: activity(now, timeout), now });
      if (result) return { ...result, contactType: conversation.tipo_contacto };
    }

    if (newPatientSteps.has(conversation.paso_actual)) {
      const result = await processNewPatientStep({ conversation, message: input.message, transaction, activity: activity(now, timeout), now, models: { patientModel, contactModel, relationModel } });
      if (['OTHER_ADULT_REFERRED','POSSIBLE_PATIENT_DUPLICATE','AMBIGUOUS_GUARDIAN'].includes(result?.responseKind)) await createOrReuseReceptionReferral({ conversation, type: 'REGISTRO_PACIENTE', transaction, referralModel, now, db });
      if (result) return { ...result, contactType: conversation.tipo_contacto };
    }

    if (managementSteps.has(conversation.paso_actual)) {
      const result = await processManagementStep({ conversation, message: input.message, appointmentModel, patientModel, referralModel, transaction, db, activity: activity(now, timeout), now, availability });
      if (result?.goToMenu || result?.abortManagement) {
        const patientReference = conversation.contexto?.patient_reference;
        await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_OPTION, opcion_principal: null, contexto: patientReference ? { patient_reference: patientReference } : {}, ...activity(now, timeout) }, { transaction });
        return { responseText: buildMainMenu(conversation.tipo_contacto), responseKind: 'MAIN_MENU', contactType: conversation.tipo_contacto, conversationStep: CONVERSATION_STEPS.WAITING_OPTION };
      }
      if (result) return { ...result, contactType: conversation.tipo_contacto };
    }

    if (appointmentSteps.has(conversation.paso_actual)) {
      const appointmentResult = await processAppointmentStep({
        conversation,
        message: input.message,
        requestModel,
        transaction,
        activity: activity(now, timeout),
        now,
        availability
      });
      if (appointmentResult?.requestCreated) {
        return { ...(await offerAvailability({ conversation, request: appointmentResult.requestCreated, transaction, activity: activity(now, timeout), now, availability })), contactType: conversation.tipo_contacto };
      }
      if (appointmentResult) return {
        ...appointmentResult,
        contactType: conversation.tipo_contacto
      };
    }

    if (confirmationSteps.has(conversation.paso_actual)) {
      const result = await processFinalConfirmation({ conversation, message: input.message, requestModel, appointmentModel, patientModel, transaction, db, activity: activity(now, timeout), now, availability });
      if (result) return { ...result, contactType: conversation.tipo_contacto };
    }

    if (availabilitySteps.has(conversation.paso_actual)) {
      const result = await processAvailabilityStep({ conversation, message: input.message, requestModel, transaction, activity: activity(now, timeout), now, availability });
      if (result) return { ...result, contactType: conversation.tipo_contacto };
    }

    if (!Object.values(CONVERSATION_STEPS).includes(conversation.paso_actual)) {
      await conversation.update({ estado: CONVERSATION_STATUS.EXPIRED }, { transaction });
      console.warn('[WhatsApp] Estado conversacional inválido reiniciado');
      const identification = await identify(phone);
      if (![CONTACT_TYPES.EXISTING, CONTACT_TYPES.NEW].includes(identification.type)) {
        return { responseText: input.identificationResponse(identification), responseKind: 'CONTACT_IDENTIFICATION', contactType: identification.type };
      }
      const replacement = await model.create({
        telefono: phone,
        paciente_id: identification.patient?.id || null,
        tipo_contacto: identification.type,
        estado: CONVERSATION_STATUS.ACTIVE,
        paso_actual: CONVERSATION_STEPS.WAITING_OPTION,
        opcion_principal: null,
        contexto: identification.type === CONTACT_TYPES.EXISTING && identification.patient?.id
          ? { patient_reference: { id: identification.patient.id, first_name: sanitizeFirstName(identification.patient.firstName) } }
          : {},
        ...activity(now, timeout)
      }, { transaction });
      return { responseText: buildMainMenu(identification.type, identification.patient?.firstName), responseKind: 'MAIN_MENU', contactType: identification.type, conversationStep: replacement.paso_actual };
    }
    await conversation.update(activity(now, timeout), { transaction });
    return { responseText: RESPONSES.CONTINUATION, responseKind: 'FLOW_PENDING', contactType: conversation.tipo_contacto, conversationStep: conversation.paso_actual };
    });
    const appointmentId = result?.syncAppointmentId;
    if (appointmentId) {
      const synchronize = dependencies.syncAppointmentById || syncAppointmentById;
      try { await synchronize(appointmentId); }
      catch { console.error('[Google Calendar] No se pudo sincronizar la cita confirmada por WhatsApp'); }
      delete result.syncAppointmentId;
    }
    return result;
  } catch (error) {
    if (error?.code === 'APPOINTMENT_REQUEST_CREATE_FAILED') {
      return { responseText: REQUEST_MESSAGES.CREATE_ERROR, responseKind: 'REQUEST_CREATE_ERROR' };
    }
    if (error?.code === 'WHATSAPP_APPOINTMENT_CREATE_FAILED') {
      return { responseText: FINAL_CONFIRMATION_ERROR, responseKind: 'APPOINTMENT_CREATE_ERROR' };
    }
    if (error?.code === 'WHATSAPP_APPOINTMENT_MANAGEMENT_FAILED') {
      return { responseText: MANAGEMENT_ERROR, responseKind: 'APPOINTMENT_MANAGEMENT_ERROR' };
    }
    if (error?.code === 'WHATSAPP_APPOINTMENT_QUERY_FAILED') {
      return { responseText: MANAGEMENT_QUERY_ERROR, responseKind: 'APPOINTMENT_QUERY_ERROR' };
    }
    throw error;
  }
};

module.exports = {
  RESPONSES, NEW_CONTACT_MENU, buildExistingMenu, buildMainMenu, buildInvalidOptionMessage,
  normalizeMenuOption, normalizeCommand, normalizeGreeting, processConversationMessage
};
