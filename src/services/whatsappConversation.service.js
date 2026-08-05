const sequelize = require('../config/database');
const { getConversationTimeoutMinutes } = require('../config/whatsapp');
const { normalizePhoneNumber } = require('../utils/phone');
const { identifyWhatsappContact } = require('./whatsappPatient.service');
const {
  WhatsappConversacion, CONVERSATION_STATUS, CONVERSATION_STEPS, MAIN_OPTIONS, CONTACT_TYPES
} = require('../models/WhatsappConversacion');
const { WhatsappSolicitudCita } = require('../models/WhatsappSolicitudCita');
const { Cita, Paciente, WhatsappAppointmentReminder } = require('../models');
const {
  MESSAGES: REQUEST_MESSAGES, appointmentSteps, buildStepHelp, processAppointmentStep, sanitizeFirstName
} = require('./whatsappAppointmentRequest.service');
const availabilityDefault = require('./appointmentAvailability.service');
const { availabilitySteps, help: availabilityHelp, offerAvailability, processAvailabilityStep, cancelAvailabilityRequest } = require('./whatsappAvailability.service');
const { confirmationSteps, processFinalConfirmation, ERROR_MESSAGE: FINAL_CONFIRMATION_ERROR } = require('./whatsappAppointmentConfirmation.service');
const { managementSteps, processManagementStep, help: managementHelp, QUERY_ERROR: MANAGEMENT_QUERY_ERROR, UPDATE_ERROR: MANAGEMENT_ERROR } = require('./whatsappAppointmentManagement.service');
const { reminderSteps, processReminderResponse, help: reminderHelp } = require('./whatsappReminderResponse.service');
const { createOrReuseReceptionReferral } = require('./whatsappReceptionReferral.service');

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
    1: [CONVERSATION_STEPS.WAITING_NAME, MAIN_OPTIONS.BOOK, REQUEST_MESSAGES.START_NEW],
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
  const reminderModel = dependencies.reminderModel || WhatsappAppointmentReminder;
  const referralModel = dependencies.referralModel;
  const timeout = dependencies.timeoutMinutes || getConversationTimeoutMinutes();
  const now = dependencies.now ? new Date(dependencies.now) : new Date();

  try {
    return await db.transaction(async (transaction) => {
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
      const identification = await identify(phone);
      if (![CONTACT_TYPES.EXISTING, CONTACT_TYPES.NEW].includes(identification.type)) {
        return { responseText: input.identificationResponse(identification), responseKind: 'CONTACT_IDENTIFICATION', contactType: identification.type };
      }
      conversation = await model.create({
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
      console.info('[WhatsApp] Conversación nueva creada');
      return { responseText: buildMainMenu(identification.type, identification.patient?.firstName), responseKind: 'MAIN_MENU', contactType: identification.type, conversationStep: conversation.paso_actual };
    }

    console.info('[WhatsApp] Conversación activa encontrada');
    const command = normalizeCommand(input.message);
    const greeting = normalizeGreeting(input.message);
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
