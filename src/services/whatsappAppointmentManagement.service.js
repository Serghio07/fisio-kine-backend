const { Op } = require('sequelize');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');
const { Cita, Paciente } = require('../models');
const {
  getWhatsappMaxAppointmentsList, getWhatsappAppointmentListTimeoutMinutes,
  getWhatsappSlotOptionsTimeoutMinutes, getWhatsappMaxAvailableSlots
} = require('../config/whatsapp');
const availabilityDefault = require('./appointmentAvailability.service');
const { MESSAGES: REQUEST_MESSAGES, parsePreferredDate, sanitizeFirstName, cleanText } = require('./whatsappAppointmentRequest.service');
const { createOrReuseReceptionReferral } = require('./whatsappReceptionReferral.service');

const VISIBLE_STATUSES = Object.freeze(['Pendiente', 'Programada', 'Confirmada']);
const managementSteps = new Set([
  CONVERSATION_STEPS.START_APPOINTMENTS, CONVERSATION_STEPS.START_RESCHEDULE_CANCEL,
  CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, CONVERSATION_STEPS.SHOWING_APPOINTMENT_DETAIL,
  CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION, CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION,
  CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT,
  CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION, CONVERSATION_STEPS.APPOINTMENT_CANCELLED,
  CONVERSATION_STEPS.APPOINTMENT_RESCHEDULED
]);
const QUERY_ERROR = 'Tuvimos un pequeño inconveniente al consultar tus citas.\n\nPor favor, inténtalo nuevamente en unos minutos.';
const UPDATE_ERROR = 'Tuvimos un pequeño inconveniente.\n\nNo se realizó ningún cambio. Inténtalo nuevamente en unos minutos.';
const normalize = (value) => cleanText(value).toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const localParts = (now) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: availabilityDefault.TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
const localNow = (now) => { const p = localParts(now); return { date: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, minutes: p.hour * 60 + p.minute }; };
const isFuture = (appointment, now) => { const local = localNow(now); return appointment.fecha > local.date || (appointment.fecha === local.date && availabilityDefault.toMinutes(appointment.hora_inicio) > local.minutes); };
const humanDate = (date) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const slotText = (appointment) => `${String(appointment.hora_inicio).slice(0, 5)}${appointment.hora_fin ? ` a ${String(appointment.hora_fin).slice(0, 5)}` : ''}`;
const firstName = (conversation) => sanitizeFirstName(conversation.contexto?.contact_first_name || conversation.contexto?.patient_reference?.first_name);
const baseContext = (conversation) => ({
  ...(conversation.contexto?.patient_reference ? { patient_reference: conversation.contexto.patient_reference } : {}),
  ...(firstName(conversation) ? { contact_first_name: firstName(conversation) } : {})
});
const expiresAt = (now, minutes) => new Date(now.getTime() + minutes * 60000).toISOString();
const refFor = (appointment, index) => ({ option: index + 1, appointment_id: appointment.id, date: appointment.fecha, start: String(appointment.hora_inicio).slice(0, 5), end: appointment.hora_fin ? String(appointment.hora_fin).slice(0, 5) : null });
const originalSlot = (appointment) => ({ date: appointment.fecha, start: String(appointment.hora_inicio).slice(0, 5), end: appointment.hora_fin ? String(appointment.hora_fin).slice(0, 5) : null, status: appointment.estado, updated_at: new Date(appointment.updated_at).toISOString() });
const sameOriginal = (appointment, original) => original && appointment.fecha === original.date && String(appointment.hora_inicio).slice(0, 5) === original.start && (appointment.hora_fin ? String(appointment.hora_fin).slice(0, 5) : null) === original.end && appointment.estado === original.status && new Date(appointment.updated_at).toISOString() === original.updated_at;

const getUpcomingAppointmentsForPatient = ({ patientId, now, appointmentModel = Cita, transaction, limit = getWhatsappMaxAppointmentsList() }) => {
  const local = localNow(now);
  return appointmentModel.findAll({
    attributes: ['id', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'paciente_id', 'profesional_id', 'historia_clinica_id', 'sesion_id', 'origen', 'updated_at'],
    where: { paciente_id: patientId, estado: { [Op.in]: VISIBLE_STATUSES }, [Op.or]: [{ fecha: { [Op.gt]: local.date } }, { fecha: local.date, hora_inicio: { [Op.gt]: `${String(Math.floor(local.minutes / 60)).padStart(2, '0')}:${String(local.minutes % 60).padStart(2, '0')}` } }] },
    order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']], limit, transaction
  });
};

const buildListMessage = (conversation, appointments, mode) => {
  if (!appointments.length) return `${firstName(conversation) ? `Por ahora no tienes citas próximas, ${firstName(conversation)}.` : 'Por ahora no tienes citas próximas.'}\n\n¿Deseas agendar una? 😊\n\n1. Sí, agendar\n2. Volver al menú`;
  const title = mode === 'MANAGE' ? 'Selecciona la cita que deseas gestionar:' : `${firstName(conversation) ? `${firstName(conversation)}, estas` : 'Estas'} son tus próximas citas:`;
  return `${title}\n\n${appointments.map((item, index) => `${index + 1}. ${humanDate(item.fecha)}, ${slotText(item)}`).join('\n')}\n\nElige la cita que deseas revisar.`;
};

const showList = async ({ conversation, mode, appointmentModel, transaction, activity, now }) => {
  if (conversation.tipo_contacto !== CONTACT_TYPES.EXISTING || !conversation.paciente_id) return { responseText: 'No encontramos un registro de paciente asociado a este número.\n\nPara consultar, cancelar o reprogramar una cita, comunícate con recepción para verificar tus datos.', responseKind: 'MANAGEMENT_NOT_PATIENT', conversationStep: conversation.paso_actual };
  console.info('[WhatsApp] Consultando próximas citas');
  let appointments;
  try {
    appointments = await getUpcomingAppointmentsForPatient({ patientId: conversation.paciente_id, now, appointmentModel, transaction });
  } catch (cause) {
    console.error('[WhatsApp] Error al consultar citas');
    const error = new Error('No fue posible consultar citas por WhatsApp');
    error.code = 'WHATSAPP_APPOINTMENT_QUERY_FAILED';
    error.cause = cause;
    throw error;
  }
  console.info(appointments.length ? '[WhatsApp] Próximas citas encontradas' : '[WhatsApp] Paciente sin citas próximas');
  const management = { mode, offered_at: now.toISOString(), expires_at: expiresAt(now, getWhatsappAppointmentListTimeoutMinutes()), appointments: appointments.map(refFor) };
  if (appointments.length === 1) {
    const appointment = appointments[0];
    const nextStep = mode === 'MANAGE' ? CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION : CONVERSATION_STEPS.SHOWING_APPOINTMENT_DETAIL;
    await conversation.update({ paso_actual: nextStep, contexto: { ...baseContext(conversation), appointment_management: { ...management, appointment_id: appointment.id, original_slot: originalSlot(appointment), appointments: undefined } }, ...activity }, { transaction });
    return { responseText: minimalDetail(appointment, mode === 'MANAGE', firstName(conversation)), responseKind: 'APPOINTMENT_DETAIL', conversationStep: nextStep };
  }
  const context = { ...baseContext(conversation), appointment_management: management };
  await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION, contexto: context, ...activity }, { transaction });
  return { responseText: buildListMessage(conversation, appointments, mode), responseKind: appointments.length ? 'APPOINTMENT_LIST' : 'NO_UPCOMING_APPOINTMENTS', conversationStep: CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION };
};

const loadOwned = async ({ conversation, appointmentId, appointmentModel, transaction, lock = false }) => appointmentModel.findOne({ where: { id: appointmentId, paciente_id: conversation.paciente_id }, transaction, ...(lock ? { lock: transaction.LOCK?.UPDATE } : {}) });
const minimalDetail = (appointment, manage, name = '') => `${manage ? '¿Qué deseas hacer con esta cita?' : `${name ? `${name}, esta es tu próxima cita` : 'Esta es tu próxima cita'} 😊`}\n\n📅 ${humanDate(appointment.fecha)}\n🕘 ${slotText(appointment)}${manage ? '\n\n1. Reprogramar\n2. Cancelar\n3. Elegir otra cita\n4. Volver al menú' : `\n📌 Estado: ${appointment.estado}\n\n1. Ver otra cita\n2. Volver al menú`}`;
const cancellationSummary = (_conversation, appointment) => `¿Seguro que deseas cancelar esta cita?\n\n📅 ${humanDate(appointment.fecha)}\n🕘 ${slotText(appointment)}\n\n1. Sí, cancelar\n2. No, mantenerla`;
const rescheduleDatePrompt = 'Indica la nueva fecha que prefieres para tu cita.\n\nPuedes escribir, por ejemplo:\n\n- 08/08/2026\n- mañana\n- próximo lunes\n\nNo se modificará la cita hasta que confirmes el nuevo horario.\n\nEscribe CANCELAR para abandonar la reprogramación.';
const durationOf = (appointment) => { const start = availabilityDefault.toMinutes(appointment.hora_inicio); const end = availabilityDefault.toMinutes(appointment.hora_fin); return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null; };
const availabilityMessage = (slots) => `Estos son los horarios disponibles:\n\n${slots.map((slot) => `${slot.option}. ${slot.start}`).join('\n')}\n\nElige el número del horario que prefieras.\n\nTambién puedes escribir OTRA FECHA.`;

const offerRescheduleSlots = async ({ conversation, management, date, appointmentModel, transaction, activity, now, availability }) => {
  const durationMinutes = availabilityDefault.toMinutes(management.original_slot.end) - availabilityDefault.toMinutes(management.original_slot.start);
  console.info('[WhatsApp] Consultando disponibilidad para reprogramación');
  const result = await availability.getAvailableSlots({ date, durationMinutes, maxSlots: getWhatsappMaxAvailableSlots(), excludeAppointmentId: management.appointment_id, appointmentModel, transaction, now });
  const available = { offered_at: now.toISOString(), expires_at: expiresAt(now, getWhatsappSlotOptionsTimeoutMinutes()), slots: result.slots };
  const next = { ...management, mode: 'RESCHEDULE', candidate_date: date, candidate_slot: null, availability: available };
  await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT, contexto: { ...baseContext(conversation), appointment_management: next }, ...activity }, { transaction });
  return { responseText: result.slots.length ? availabilityMessage(result.slots) : 'No encontramos horarios disponibles para esa fecha.\n\nEscribe OTRA FECHA para intentar con otro día o CANCELAR para conservar tu cita original.', responseKind: result.slots.length ? 'RESCHEDULE_SLOTS' : 'NO_RESCHEDULE_SLOTS', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT };
};

const appendHistory = (appointment, entry) => [...(Array.isArray(appointment.historial_programacion) ? appointment.historial_programacion : []), entry];

const processManagementStep = async ({ conversation, message, appointmentModel = Cita, patientModel = Paciente, referralModel, transaction, db, activity, now, availability = availabilityDefault }) => {
  const step = conversation.paso_actual;
  const choice = normalize(message);
  if ([CONVERSATION_STEPS.START_APPOINTMENTS, CONVERSATION_STEPS.START_RESCHEDULE_CANCEL].includes(step)) {
    const patient = conversation.paciente_id ? await patientModel.findByPk(conversation.paciente_id, { attributes: ['id', 'estado', 'registro_pendiente'], transaction }) : null;
    if (!patient || patient.estado !== true || patient.registro_pendiente === true) return { responseText: 'No encontramos un registro de paciente asociado a este número.\n\nPara consultar, cancelar o reprogramar una cita, comunícate con recepción para verificar tus datos.', responseKind: 'MANAGEMENT_NOT_PATIENT', conversationStep: step };
    return showList({ conversation, mode: step === CONVERSATION_STEPS.START_APPOINTMENTS ? 'CONSULT' : 'MANAGE', appointmentModel, transaction, activity, now });
  }
  const management = conversation.contexto?.appointment_management;
  if (!management) return showList({ conversation, mode: 'CONSULT', appointmentModel, transaction, activity, now });

  if (step === CONVERSATION_STEPS.WAITING_APPOINTMENT_SELECTION) {
    if (new Date(management.expires_at) <= now) return showList({ conversation, mode: management.mode, appointmentModel, transaction, activity, now });
    if (!management.appointments?.length) {
      if (choice === '1') {
        const name = firstName(conversation);
        await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_REASON, opcion_principal: 'AGENDAR_CITA', contexto: { ...baseContext(conversation) }, ...activity }, { transaction });
        return { responseText: REQUEST_MESSAGES.START_EXISTING(name), responseKind: 'BOOKING_STARTED', conversationStep: CONVERSATION_STEPS.WAITING_REASON };
      }
      if (choice === '2') return { goToMenu: true };
      return { responseText: 'Responde 1 para agendar una cita o 2 para volver al menú.', responseKind: 'INVALID_OPTION', conversationStep: step };
    }
    const selected = management.appointments?.find((item) => String(item.option) === choice);
    if (!selected) return { responseText: 'Escribe el número de una de las citas mostradas.', responseKind: 'INVALID_APPOINTMENT_OPTION', conversationStep: step };
    const appointment = await loadOwned({ conversation, appointmentId: selected.appointment_id, appointmentModel, transaction });
    if (!appointment || !VISIBLE_STATUSES.includes(appointment.estado) || !isFuture(appointment, now)) return showList({ conversation, mode: management.mode, appointmentModel, transaction, activity, now });
    console.info('[WhatsApp] Cita seleccionada');
    const nextStep = management.mode === 'MANAGE' ? CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION : CONVERSATION_STEPS.SHOWING_APPOINTMENT_DETAIL;
    await conversation.update({ paso_actual: nextStep, contexto: { ...baseContext(conversation), appointment_management: { ...management, appointment_id: appointment.id, original_slot: originalSlot(appointment), appointments: undefined } }, ...activity }, { transaction });
    return { responseText: minimalDetail(appointment, management.mode === 'MANAGE'), responseKind: 'APPOINTMENT_DETAIL', conversationStep: nextStep };
  }

  if (step === CONVERSATION_STEPS.SHOWING_APPOINTMENT_DETAIL) {
    if (choice === '1') return showList({ conversation, mode: 'CONSULT', appointmentModel, transaction, activity, now });
    if (choice === '2') return { goToMenu: true };
    return { responseText: 'Responde 1 para volver a tus citas o 2 para volver al menú.', responseKind: 'INVALID_OPTION', conversationStep: step };
  }

  if (step === CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION) {
    const appointment = await loadOwned({ conversation, appointmentId: management.appointment_id, appointmentModel, transaction });
    if (!appointment || !VISIBLE_STATUSES.includes(appointment.estado) || !isFuture(appointment, now)) return showList({ conversation, mode: 'MANAGE', appointmentModel, transaction, activity, now });
    if (choice === '1') {
      console.info('[WhatsApp] Iniciando reprogramación');
      if (!durationOf(appointment)) { await createOrReuseReceptionReferral({ conversation, type: 'AYUDA_REPROGRAMACION', appointmentId: appointment.id, transaction, referralModel, now, context: { technical_reason: 'INVALID_APPOINTMENT_DURATION' } }); return { responseText: 'No pudimos determinar de forma segura la duración de esta cita.\n\nTu solicitud quedó pendiente de revisión por recepción. No se modificó la cita.', responseKind: 'RESCHEDULE_REFERRED', conversationStep: step }; }
      await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, contexto: { ...baseContext(conversation), appointment_management: { mode: 'RESCHEDULE', appointment_id: appointment.id, original_slot: originalSlot(appointment) } }, ...activity }, { transaction });
      return { responseText: rescheduleDatePrompt, responseKind: 'RESCHEDULE_DATE_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE };
    }
    if (choice === '2') {
      console.info('[WhatsApp] Iniciando cancelación de cita');
      await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION, ...activity }, { transaction });
      return { responseText: cancellationSummary(conversation, appointment), responseKind: 'CANCELLATION_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION };
    }
    if (choice === '3') return showList({ conversation, mode: 'MANAGE', appointmentModel, transaction, activity, now });
    if (choice === '4') return { goToMenu: true };
    return { responseText: 'Responde 1 para reprogramar, 2 para cancelar, 3 para elegir otra cita o 4 para volver al menú.', responseKind: 'INVALID_OPTION', conversationStep: step };
  }

  if (step === CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION) {
    if (choice === '2') { await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION, ...activity }, { transaction }); return { responseText: 'Volviste a las opciones de la cita.\n\n1. Reprogramar cita\n2. Cancelar cita\n3. Elegir otra cita\n4. Volver al menú', responseKind: 'CANCELLATION_ABORTED', conversationStep: CONVERSATION_STEPS.WAITING_APPOINTMENT_ACTION }; }
    if (choice === '3') return showList({ conversation, mode: 'MANAGE', appointmentModel, transaction, activity, now });
    if (choice === '4') return { goToMenu: true };
    if (!['1', 'confirmar', 'confirmar cancelacion'].includes(choice)) return { responseText: 'Para cancelar la cita responde 1. Escribir CANCELAR abandonará el proceso sin modificarla.', responseKind: 'INVALID_OPTION', conversationStep: step };
    console.info('[WhatsApp] Revalidando cancelación');
    const appointment = await loadOwned({ conversation, appointmentId: management.appointment_id, appointmentModel, transaction, lock: true });
    if (!appointment) return showList({ conversation, mode: 'MANAGE', appointmentModel, transaction, activity, now });
    if (appointment.estado === 'Cancelada') return { responseText: `Esta cita ya fue cancelada anteriormente.\n\nFecha:\n${humanDate(appointment.fecha)}\n\nHorario:\n${slotText(appointment)}`, responseKind: 'APPOINTMENT_ALREADY_CANCELLED', conversationStep: step };
    if (!VISIBLE_STATUSES.includes(appointment.estado) || !isFuture(appointment, now)) return { responseText: 'Esta cita ya comenzó o cambió de estado y no puede modificarse desde WhatsApp.\n\nComunícate con recepción.', responseKind: 'APPOINTMENT_NOT_MANAGEABLE', conversationStep: step };
    try {
      await appointment.update({ estado: 'Cancelada', historial_programacion: appendHistory(appointment, { accion: 'CANCELACION_WHATSAPP', estado_anterior: appointment.estado, estado_nuevo: 'Cancelada', registrado_en: now.toISOString() }) }, { transaction });
      await conversation.update({ paso_actual: CONVERSATION_STEPS.APPOINTMENT_CANCELLED, contexto: baseContext(conversation), ...activity }, { transaction });
    } catch (cause) { const error = new Error('No fue posible cancelar la cita'); error.code = 'WHATSAPP_APPOINTMENT_MANAGEMENT_FAILED'; error.cause = cause; throw error; }
    console.info('[WhatsApp] Cita cancelada');
    return { responseText: `Tu cita fue cancelada correctamente.\n\nEsperamos poder atenderte en otra ocasión 😊\n\nEscribe MENÚ para volver.`, responseKind: 'APPOINTMENT_CANCELLED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_CANCELLED };
  }

  if (step === CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE) {
    const parsed = parsePreferredDate(message, { now });
    if (!parsed.valid) return { responseText: 'La fecha no es válida. Escribe una fecha futura de atención, por ejemplo 08/08/2026, mañana o próximo lunes.', responseKind: 'INVALID_RESCHEDULE_DATE', conversationStep: step };
    return offerRescheduleSlots({ conversation, management, date: parsed.value, appointmentModel, transaction, activity, now, availability });
  }

  if (step === CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT) {
    if (choice === 'otra fecha') { await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, ...activity }, { transaction }); return { responseText: rescheduleDatePrompt, responseKind: 'RESCHEDULE_DATE_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE }; }
    if (new Date(management.availability?.expires_at) <= now) return offerRescheduleSlots({ conversation, management, date: management.candidate_date, appointmentModel, transaction, activity, now, availability });
    const slot = management.availability?.slots?.find((item) => String(item.option) === choice);
    if (!slot) return { responseText: 'Responde con el número de uno de los horarios mostrados, OTRA FECHA o CANCELAR.', responseKind: 'INVALID_RESCHEDULE_SLOT', conversationStep: step };
    const next = { ...management, candidate_slot: { date: slot.date, start: slot.start, end: slot.end } };
    await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION, contexto: { ...baseContext(conversation), appointment_management: next }, ...activity }, { transaction });
    console.info('[WhatsApp] Nuevo horario seleccionado');
    return { responseText: `Vamos a cambiar tu cita:\n\nAntes:\n📅 ${humanDate(management.original_slot.date)}\n🕘 ${management.original_slot.start} a ${management.original_slot.end}\n\nAhora:\n📅 ${humanDate(slot.date)}\n🕘 ${slot.start} a ${slot.end}\n\n¿Confirmamos el cambio?\n\n1. Sí, reprogramar\n2. Elegir otro horario\n3. Elegir otro día\n4. Volver`, responseKind: 'RESCHEDULE_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION };
  }

  if (step === CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION) {
    if (choice === '2') return offerRescheduleSlots({ conversation, management, date: management.candidate_date, appointmentModel, transaction, activity, now, availability });
    if (choice === '3') { await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, ...activity }, { transaction }); return { responseText: rescheduleDatePrompt, responseKind: 'RESCHEDULE_DATE_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE }; }
    if (choice === '4') return { abortManagement: true };
    if (!['1', 'confirmar', 'confirmar reprogramacion'].includes(choice)) return { responseText: 'Responde 1 para confirmar, 2 para elegir otro horario, 3 para cambiar fecha o 4 para cancelar la reprogramación.', responseKind: 'INVALID_OPTION', conversationStep: step };
    if (!management.candidate_slot || new Date(management.availability?.expires_at) <= now) return offerRescheduleSlots({ conversation, management, date: management.candidate_date, appointmentModel, transaction, activity, now, availability });
    const durationMinutes = availabilityDefault.toMinutes(management.candidate_slot.end) - availabilityDefault.toMinutes(management.candidate_slot.start);
    const validCandidate = availability.generateCandidateSlots({ date: management.candidate_slot.date, durationMinutes, now }).some((slot) => slot.start === management.candidate_slot.start && slot.end === management.candidate_slot.end);
    if (!validCandidate) return { responseText: UPDATE_ERROR, responseKind: 'INVALID_RESCHEDULE_SLOT', conversationStep: step };
    console.info('[WhatsApp] Revalidando reprogramación');
    const appointment = await loadOwned({ conversation, appointmentId: management.appointment_id, appointmentModel, transaction, lock: true });
    if (!appointment || !sameOriginal(appointment, management.original_slot) || !VISIBLE_STATUSES.includes(appointment.estado) || !isFuture(appointment, now)) {
      console.info('[WhatsApp] Cita modificada por otro proceso');
      return { responseText: 'La cita fue modificada mientras realizabas la reprogramación.\n\nNo se aplicaron cambios desde WhatsApp.\n\nEscribe MENÚ para consultar nuevamente.', responseKind: 'APPOINTMENT_CHANGED', conversationStep: step };
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext(:slotKey))', { replacements: { slotKey: `whatsapp-appointment:${management.candidate_slot.date}` }, transaction });
    const free = await availability.revalidateSlotCapacity({ slot: management.candidate_slot, excludeAppointmentId: appointment.id, appointmentModel, transaction, now });
    if (!free) { console.info('[WhatsApp] Horario de reprogramación agotado'); return offerRescheduleSlots({ conversation, management, date: management.candidate_date, appointmentModel, transaction, activity, now, availability }); }
    try {
      const history = appendHistory(appointment, { accion: 'REPROGRAMACION_WHATSAPP', fecha_anterior: appointment.fecha, hora_inicio_anterior: String(appointment.hora_inicio).slice(0, 5), hora_fin_anterior: String(appointment.hora_fin).slice(0, 5), fecha_nueva: management.candidate_slot.date, hora_inicio_nueva: management.candidate_slot.start, hora_fin_nueva: management.candidate_slot.end, registrado_en: now.toISOString() });
      await appointment.update({ fecha: management.candidate_slot.date, hora_inicio: management.candidate_slot.start, hora_fin: management.candidate_slot.end, fecha_programada_original: appointment.fecha_programada_original || appointment.fecha, hora_inicio_original: appointment.hora_inicio_original || appointment.hora_inicio, hora_fin_original: appointment.hora_fin_original || appointment.hora_fin, motivo_cambio: 'Reprogramación solicitada por WhatsApp', historial_programacion: history }, { transaction });
      await conversation.update({ paso_actual: CONVERSATION_STEPS.APPOINTMENT_RESCHEDULED, contexto: baseContext(conversation), ...activity }, { transaction });
    } catch (cause) { const error = new Error('No fue posible reprogramar la cita'); error.code = 'WHATSAPP_APPOINTMENT_MANAGEMENT_FAILED'; error.cause = cause; throw error; }
    console.info('[WhatsApp] Cita reprogramada');
    return { responseText: `¡Listo! ✅\n\nTu cita fue reprogramada para:\n\n📅 ${humanDate(management.candidate_slot.date)}\n🕘 ${management.candidate_slot.start} a ${management.candidate_slot.end}\n\nEscribe MENÚ cuando necesites otra opción.`, responseKind: 'APPOINTMENT_RESCHEDULED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_RESCHEDULED };
  }
  return { responseText: 'La operación ya finalizó. Escribe MENÚ para realizar otra operación.', responseKind: 'MANAGEMENT_FINISHED', conversationStep: step };
};

const help = (step) => {
  if (step === CONVERSATION_STEPS.WAITING_CANCELLATION_CONFIRMATION) return 'Para cancelar la cita, responde 1. Escribir CANCELAR abandonará este proceso sin modificarla.';
  if ([CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, CONVERSATION_STEPS.WAITING_RESCHEDULE_SLOT, CONVERSATION_STEPS.WAITING_RESCHEDULE_CONFIRMATION].includes(step)) return 'Puedes elegir una fecha u horario según el paso, escribir OTRA FECHA o CANCELAR para conservar la cita original.';
  return 'Escribe el número de la cita u opción que deseas seleccionar. También puedes escribir MENÚ o CANCELAR.';
};

module.exports = { VISIBLE_STATUSES, managementSteps, QUERY_ERROR, UPDATE_ERROR, isFuture, getUpcomingAppointmentsForPatient, buildListMessage, processManagementStep, help };
