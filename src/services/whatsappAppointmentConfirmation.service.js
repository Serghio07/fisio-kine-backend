const { CONVERSATION_STATUS, CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');
const { Cita, Paciente } = require('../models');
const availabilityDefault = require('./appointmentAvailability.service');
const { offerAvailability } = require('./whatsappAvailability.service');
const { cleanText, sanitizeFirstName } = require('./whatsappAppointmentRequest.service');
const { createOrReuseReceptionReferral } = require('./whatsappReceptionReferral.service');

const confirmationSteps = new Set([
  CONVERSATION_STEPS.SLOT_SELECTED, CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION,
  CONVERSATION_STEPS.APPOINTMENT_CREATED, CONVERSATION_STEPS.REFERRED_RECEPTION
]);
const humanDate = (date) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const normalizeChoice = (value) => cleanText(value).toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const firstNameFor = (conversation, request) => sanitizeFirstName(conversation.contexto?.contact_first_name || request.nombre_whatsapp);
const finalSummary = (conversation, request) => `Muy bien${firstNameFor(conversation, request) ? `, ${firstNameFor(conversation, request)}` : ''} 😊\n\n${conversation.tipo_contacto === CONTACT_TYPES.NEW ? 'Tu solicitud' : 'Tu cita'} quedaría así:\n\n📅 ${humanDate(request.fecha_solicitada)}\n🕘 ${String(request.hora_inicio).slice(0, 5)} a ${String(request.hora_fin).slice(0, 5)}\n📝 ${request.motivo || 'Consulta de fisioterapia'}\n\n¿La ${conversation.tipo_contacto === CONTACT_TYPES.NEW ? 'enviamos' : 'confirmamos'}?\n\n1. Sí, ${conversation.tipo_contacto === CONTACT_TYPES.NEW ? 'enviar' : 'agendar'}\n2. Elegir otro horario\n3. Elegir otro día\n4. Cancelar`;
const ERROR_MESSAGE = 'No pudimos registrar la cita en este momento.\n\nNo se realizó ningún cambio.\n\nPor favor, intenta nuevamente en unos minutos o escribe MENÚ.';
const requestReady = (request, now) => request && request.tipo_solicitud === 'AGENDAR' && request.estado === 'PENDIENTE_CONFIRMACION' && request.paso_actual === CONVERSATION_STEPS.SLOT_SELECTED && !request.cita_id && request.fecha_solicitada && request.hora_inicio && request.hora_fin
  && (!request.expira_en || !now || new Date(request.expira_en).getTime() > now.getTime());
const selectedSlotConsistent = (request) => {
  const slot = request.datos_temporales?.availability?.selected_slot;
  return slot && slot.date === request.fecha_solicitada && slot.start === String(request.hora_inicio).slice(0, 5) && slot.end === String(request.hora_fin).slice(0, 5);
};
const validBusinessRange = (request, availability, now) => {
  if (request.fecha_solicitada < availability.todayIso(now)) return false;
  const start = availability.toMinutes(request.hora_inicio); const end = availability.toMinutes(request.hora_fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const period = availability.getBusinessPeriodsForDate(request.fecha_solicitada).find((item) => start >= availability.toMinutes(item.start) && end <= availability.toMinutes(item.end));
  if (!period) return false;
  if (request.fecha_solicitada === availability.todayIso(now)) {
    const candidates = availability.generateCandidateSlots({ date: request.fecha_solicitada, durationMinutes: end - start, intervalMinutes: 15, now });
    return candidates.some((slot) => slot.start === String(request.hora_inicio).slice(0, 5) && slot.end === String(request.hora_fin).slice(0, 5));
  }
  return true;
};

const loadRequest = (conversation, requestModel, transaction) => conversation.contexto?.request_id
  ? requestModel.findByPk(conversation.contexto.request_id, { transaction, lock: transaction.LOCK?.UPDATE }) : null;

const processFinalConfirmation = async ({ conversation, message, requestModel, appointmentModel = Cita, patientModel = Paciente, referralModel, transaction, db, activity, now, availability = availabilityDefault }) => {
  const request = await loadRequest(conversation, requestModel, transaction);
  if (!request) return { responseText: 'No encontramos una solicitud activa para continuar.\n\nEscribe MENÚ para comenzar nuevamente.', responseKind: 'FINAL_REQUEST_MISSING', conversationStep: conversation.paso_actual };
  if (request.cita_id) {
    console.info('[WhatsApp] Cita ya creada para solicitud');
    return { responseText: 'La cita de esta solicitud ya fue registrada. ✅\n\nEscribe MENÚ para realizar otra operación.', responseKind: 'APPOINTMENT_ALREADY_CREATED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_CREATED };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.APPOINTMENT_CREATED) return { responseText: 'La cita de esta solicitud ya fue registrada. ✅', responseKind: 'APPOINTMENT_ALREADY_CREATED', conversationStep: conversation.paso_actual };
  if (conversation.paso_actual === CONVERSATION_STEPS.REFERRED_RECEPTION || request.estado === 'DERIVADA_PERSONAL') return { responseText: 'Tu solicitud ya fue derivada para que el personal complete el registro.', responseKind: 'REQUEST_ALREADY_REFERRED', conversationStep: conversation.paso_actual };

  const choice = normalizeChoice(message);
  if (conversation.paso_actual === CONVERSATION_STEPS.SLOT_SELECTED) {
    if (choice === '2') {
      await request.update({ hora_inicio: null, hora_fin: null, datos_temporales: { ...request.datos_temporales, availability: { ...(request.datos_temporales?.availability || {}), selected_slot: null } } }, { transaction });
      return offerAvailability({ conversation, request, transaction, activity, now, availability });
    }
    if (choice === '3') {
      await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_DATE, ...activity }, { transaction });
      return { responseText: 'Indica la nueva fecha que prefieres.', responseKind: 'REQUEST_NEW_DATE', conversationStep: CONVERSATION_STEPS.WAITING_NEW_DATE };
    }
    if (choice === '4') {
      await request.update({ estado: 'CANCELADA', paso_actual: 'CANCELADA', cancelada_en: now, motivo_cancelacion: 'Cancelada antes de crear cita', expira_en: null }, { transaction });
      await conversation.update({ estado: CONVERSATION_STATUS.CANCELLED, contexto: {}, ...activity }, { transaction });
      return { responseText: 'La solicitud fue cancelada.\n\nNo se creó ninguna cita.', responseKind: 'REQUEST_CANCELLED', conversationStep: conversation.paso_actual };
    }
    if (!['1', 'continuar'].includes(choice)) return { responseText: 'Responde 1 para continuar, 2 para elegir otro horario, 3 para cambiar fecha o 4 para cancelar.', responseKind: 'INVALID_OPTION', conversationStep: conversation.paso_actual };
    if (!requestReady(request, now) || !selectedSlotConsistent(request) || !validBusinessRange(request, availability, now)) return { responseText: ERROR_MESSAGE, responseKind: 'FINAL_REQUEST_INVALID', conversationStep: conversation.paso_actual };
    await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION, ...activity }, { transaction });
    return { responseText: finalSummary(conversation, request), responseKind: 'FINAL_CONFIRMATION_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION };
  }

  if (conversation.paso_actual !== CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION) return null;
  if (choice === '2' || choice === '3' || choice === '4') {
    await conversation.update({ paso_actual: CONVERSATION_STEPS.SLOT_SELECTED, ...activity }, { transaction });
    return processFinalConfirmation({ conversation, message: choice, requestModel: { findByPk: async () => request }, appointmentModel, patientModel, transaction, db, activity, now, availability });
  }
  if (!['1', 'confirmar', 'confirmar cita', 'si', 'continuar'].includes(choice)) return { responseText: finalSummary(conversation, request), responseKind: 'INVALID_OPTION', conversationStep: conversation.paso_actual };
  console.info('[WhatsApp] Confirmación final recibida');
  if (!requestReady(request, now) || !selectedSlotConsistent(request) || !validBusinessRange(request, availability, now)) return { responseText: ERROR_MESSAGE, responseKind: 'FINAL_REQUEST_INVALID', conversationStep: conversation.paso_actual };

  if (!request.paciente_id) {
    await db.query('SELECT pg_advisory_xact_lock(hashtext(:slotKey))', { replacements: { slotKey: `whatsapp-appointment:${request.fecha_solicitada}` }, transaction });
    const free = await availability.revalidateSlotCapacity({ slot: { date: request.fecha_solicitada, start: String(request.hora_inicio).slice(0, 5), end: String(request.hora_fin).slice(0, 5) }, transaction, now, appointmentModel });
    if (!free) return offerAvailability({ conversation, request, transaction, activity, now, availability });
    const fullName = String(request.nombre_whatsapp || conversation.contexto?.contact_first_name || 'Paciente pendiente').trim().replace(/\s+/g, ' ');
    const parts = fullName.split(' '); const nombres = parts.shift(); const apellidos = parts.join(' ') || 'PENDIENTE';
    let temporaryPatient = typeof patientModel.findOne === 'function' ? await patientModel.findOne({ where: { telefono_normalizado: conversation.telefono }, transaction, lock: transaction.LOCK?.UPDATE }) : null;
    if (!temporaryPatient) temporaryPatient = await patientModel.create({ nombres, apellidos, ci: null, sexo: null, telefono: conversation.telefono, telefono_normalizado: conversation.telefono, estado: true, registro_pendiente: true }, { transaction });
    const appointment = await appointmentModel.create({ paciente_id: temporaryPatient.id, usuario_id: null, fecha: request.fecha_solicitada, hora_inicio: request.hora_inicio, hora_fin: request.hora_fin, motivo: request.motivo ? String(request.motivo).slice(0, 255) : null, tipo_atencion: 'Sesion de fisioterapia', estado: 'Pendiente', observacion: null, profesional_id: null, historia_clinica_id: null, sesion_id: null, numero_sesion: null, total_sesiones: null, origen: 'WhatsApp', historial_programacion: [] }, { transaction });
    const referral = await createOrReuseReceptionReferral({ conversation: { id: conversation.id, telefono: conversation.telefono, paciente_id: temporaryPatient.id }, type: 'REGISTRO_PACIENTE', requestId: request.id, appointmentId: appointment.id, transaction, referralModel, now, context: { requested_date: request.fecha_solicitada, requested_start: request.hora_inicio, requested_end: request.hora_fin } });
    await request.update({ paciente_id: temporaryPatient.id, cita_id: appointment.id, estado: 'CONFIRMADA', paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED, confirmacion: true, confirmada_en: now, expira_en: null }, { transaction });
    await conversation.update({ paciente_id: temporaryPatient.id, paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED, ...activity }, { transaction });
    console.info('[WhatsApp] Paciente temporal y cita creados');
    const name = firstNameFor(conversation, request);
    return { responseText: `¡Listo${name ? `, ${name}` : ''}! ✅\n\nTu horario quedó reservado para:\n\n📅 ${humanDate(request.fecha_solicitada)}\n🕘 ${String(request.hora_inicio).slice(0, 5)} a ${String(request.hora_fin).slice(0, 5)}\n\nTe enviaremos un recordatorio. Cuando asistas, recepción completará tus datos.`, responseKind: referral.created ? 'TEMPORARY_APPOINTMENT_CREATED' : 'TEMPORARY_APPOINTMENT_REUSED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_CREATED, syncAppointmentId: appointment.id };
  }

  const patient = await patientModel.findByPk(request.paciente_id, { transaction, lock: transaction.LOCK?.UPDATE });
  if (!patient || patient.estado !== true || (conversation.paciente_contexto_id ?? conversation.paciente_id) !== request.paciente_id || conversation.tipo_contacto !== CONTACT_TYPES.EXISTING) return { responseText: ERROR_MESSAGE, responseKind: 'PATIENT_INVALID', conversationStep: conversation.paso_actual };
  await db.query('SELECT pg_advisory_xact_lock(hashtext(:slotKey))', { replacements: { slotKey: `whatsapp-appointment:${request.fecha_solicitada}` }, transaction });
  console.info('[WhatsApp] Revalidando capacidad final');
  const free = await availability.revalidateSlotCapacity({ slot: { date: request.fecha_solicitada, start: String(request.hora_inicio).slice(0, 5), end: String(request.hora_fin).slice(0, 5) }, transaction, now, appointmentModel });
  if (!free) {
    console.info('[WhatsApp] Capacidad agotada antes de crear cita');
    return offerAvailability({ conversation, request, transaction, activity, now, availability });
  }
  console.info('[WhatsApp] Creando cita desde solicitud');
  let appointment;
  try {
    appointment = await appointmentModel.create({ paciente_id: request.paciente_id, usuario_id: null, fecha: request.fecha_solicitada, hora_inicio: request.hora_inicio, hora_fin: request.hora_fin, motivo: request.motivo ? String(request.motivo).slice(0, 255) : null, tipo_atencion: 'Sesion de fisioterapia', estado: 'Pendiente', observacion: null, profesional_id: null, historia_clinica_id: null, sesion_id: null, numero_sesion: null, total_sesiones: null, origen: 'WhatsApp', historial_programacion: [] }, { transaction });
    await request.update({ cita_id: appointment.id, estado: 'CONFIRMADA', paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED, confirmacion: true, confirmada_en: now, expira_en: null }, { transaction });
    await conversation.update({ paso_actual: CONVERSATION_STEPS.APPOINTMENT_CREATED, ...activity }, { transaction });
  } catch (cause) {
    console.error('[WhatsApp] Fallo transaccional al registrar cita');
    const error = new Error('No fue posible registrar la cita de WhatsApp');
    error.code = 'WHATSAPP_APPOINTMENT_CREATE_FAILED';
    error.cause = cause;
    throw error;
  }
  console.info('[WhatsApp] Solicitud vinculada con cita');
  const name = firstNameFor(conversation, request);
  return { responseText: `¡Listo${name ? `, ${name}` : ''}! ✅\n\nTu cita fue registrada para:\n\n📅 ${humanDate(request.fecha_solicitada)}\n🕘 ${String(request.hora_inicio).slice(0, 5)} a ${String(request.hora_fin).slice(0, 5)}\n\nEl centro asignará al profesional.\n\nEscribe MENÚ cuando necesites otra opción.`, responseKind: 'APPOINTMENT_CREATED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_CREATED, syncAppointmentId: appointment.id };
};

module.exports = { confirmationSteps, finalSummary, requestReady, selectedSlotConsistent, validBusinessRange, processFinalConfirmation, ERROR_MESSAGE };
