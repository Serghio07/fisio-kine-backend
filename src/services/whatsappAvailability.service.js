const { CONVERSATION_STEPS } = require('../models/WhatsappConversacion');
const { parsePreferredDate, cleanText } = require('./whatsappAppointmentRequest.service');
const availabilityDefault = require('./appointmentAvailability.service');
const { getWhatsappSlotOptionsTimeoutMinutes, getWhatsappAvailabilitySearchDays } = require('../config/whatsapp');

const availabilitySteps = new Set([
  CONVERSATION_STEPS.SEARCHING_AVAILABILITY, CONVERSATION_STEPS.WAITING_SLOT_SELECTION,
  CONVERSATION_STEPS.NO_AVAILABILITY, CONVERSATION_STEPS.WAITING_NEW_DATE,
  CONVERSATION_STEPS.REQUEST_CREATED
]);
const ERROR_MESSAGE = 'Tuvimos un pequeño inconveniente al consultar los horarios.\n\nPor favor, inténtalo nuevamente en unos minutos.';
const MISSING_MESSAGE = 'No encontramos una solicitud activa para continuar.\n\nEscribe MENÚ para comenzar nuevamente.';
const NO_SLOTS_MESSAGE = 'Ese día ya no tiene horarios disponibles.\n\nNo te preocupes 😊\n\n1. Ver el siguiente día disponible\n2. Elegir otra fecha\n3. Volver al menú\n4. Cancelar';
const help = (step) => step === CONVERSATION_STEPS.WAITING_SLOT_SELECTION
  ? 'Puedes elegir uno de los horarios escribiendo su número.\n\nEjemplo:\n1\n\nTambién puedes escribir:\n\nOTRO TURNO\nOTRO DÍA\nMENÚ\nCANCELAR\n\nSeleccionar un horario todavía no confirma una cita.'
  : 'Puedes buscar el siguiente día con espacios o indicar una fecha diferente.';
const humanDate = (date) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const slotsMessage = (date, slots) => `Estos son los horarios disponibles para el ${humanDate(date)}:\n\n${slots.map((slot) => `${slot.option}. ${slot.start}`).join('\n')}\n\nCada cita dura ${slots.length ? Math.round((Number(slotMinutes(slots[0].end)) - Number(slotMinutes(slots[0].start)))) : 90} minutos.\n\nElige el número del horario que prefieras.\n\nTambién puedes escribir OTRO TURNO u OTRO DÍA.`;
const slotMinutes = (time) => { const [hours, minutes] = String(time).slice(0, 5).split(':').map(Number); return hours * 60 + minutes; };
const cleanAvailability = (data = {}) => { const next = { ...data }; delete next.availability; return next; };
const validRequest = (request) => request && request.tipo_solicitud === 'AGENDAR' && request.estado === 'PENDIENTE_CONFIRMACION' && !request.cita_id;

const offerAvailability = async ({ conversation, request, transaction, activity, now, availability = availabilityDefault }) => {
  if (!validRequest(request) || !request.fecha_solicitada) return { responseText: MISSING_MESSAGE, responseKind: 'AVAILABILITY_REQUEST_MISSING', conversationStep: conversation.paso_actual };
  try {
    console.info('[WhatsApp] Consultando capacidad del centro');
    const temporary = request.datos_temporales || {};
    const result = await availability.getAvailableSlots({ date: request.fecha_solicitada, preferredShift: temporary.turno_preferido, preferredTime: temporary.hora_preferida, strictShift: ['MANANA', 'TARDE'].includes(temporary.turno_preferido), maxSlots: 20, transaction, now });
    if (result.capacity <= 0) return { responseText: ERROR_MESSAGE, responseKind: 'AVAILABILITY_ERROR', conversationStep: conversation.paso_actual };
    const offeredAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + getWhatsappSlotOptionsTimeoutMinutes() * 60000).toISOString();
    const availabilityData = { duration_minutes: result.durationMinutes, slot_interval_minutes: result.intervalMinutes, preferred_date: result.date, offered_at: offeredAt, expires_at: expiresAt, slots: result.slots, selected_slot: null };
    const step = result.slots.length ? CONVERSATION_STEPS.WAITING_SLOT_SELECTION : CONVERSATION_STEPS.NO_AVAILABILITY;
    await request.update({ paso_actual: step, hora_inicio: null, hora_fin: null, datos_temporales: { ...temporary, availability: availabilityData }, expira_en: new Date(expiresAt) }, { transaction });
    await conversation.update({ paso_actual: step, contexto: { ...(conversation.contexto || {}), request_id: request.id }, ...activity }, { transaction });
    if (!result.slots.length) console.info('[WhatsApp] Sin disponibilidad para fecha solicitada');
    else console.info('[WhatsApp] Opciones de horario enviadas');
    return { responseText: result.slots.length ? slotsMessage(result.date, result.slots) : NO_SLOTS_MESSAGE, responseKind: result.slots.length ? 'AVAILABLE_SLOTS' : 'NO_AVAILABILITY', conversationStep: step };
  } catch (_) {
    console.error('[WhatsApp] Error al consultar disponibilidad');
    return { responseText: ERROR_MESSAGE, responseKind: 'AVAILABILITY_ERROR', conversationStep: conversation.paso_actual };
  }
};

const loadRequest = (conversation, requestModel, transaction) => {
  const id = conversation.contexto?.request_id;
  if (!id) return null;
  return requestModel.findByPk(id, { transaction, lock: transaction.LOCK?.UPDATE });
};

const cancelAvailabilityRequest = async ({ conversation, requestModel, transaction, activity, reason = 'Cancelada por el usuario' }) => {
  const request = await loadRequest(conversation, requestModel, transaction);
  if (validRequest(request)) await request.update({ estado: 'CANCELADA', paso_actual: 'CANCELADA', datos_temporales: cleanAvailability(request.datos_temporales), hora_inicio: null, hora_fin: null, cancelada_en: activity.ultimo_mensaje_en, motivo_cancelacion: reason, expira_en: null }, { transaction });
  return request;
};

const processAvailabilityStep = async ({ conversation, message, requestModel, transaction, activity, now, availability = availabilityDefault }) => {
  const request = await loadRequest(conversation, requestModel, transaction);
  if (!validRequest(request)) return { responseText: MISSING_MESSAGE, responseKind: 'AVAILABILITY_REQUEST_MISSING', conversationStep: conversation.paso_actual };
  if (conversation.paso_actual === CONVERSATION_STEPS.REQUEST_CREATED || conversation.paso_actual === CONVERSATION_STEPS.SEARCHING_AVAILABILITY) return offerAvailability({ conversation, request, transaction, activity, now, availability });
  const text = cleanText(message).toLocaleUpperCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['OTRA FECHA', 'OTRO DIA'].includes(text)) {
    await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_DATE, ...activity }, { transaction });
    return { responseText: 'Indica la nueva fecha que prefieres.\n\nEjemplo: 08/08/2026, mañana o próximo lunes.', responseKind: 'REQUEST_NEW_DATE', conversationStep: CONVERSATION_STEPS.WAITING_NEW_DATE };
  }
  if (text === 'OTRO TURNO' && conversation.paso_actual === CONVERSATION_STEPS.WAITING_SLOT_SELECTION) {
    const current = request.datos_temporales?.turno_preferido;
    const next = current === 'MANANA' ? 'TARDE' : 'MANANA';
    await request.update({ datos_temporales: { ...request.datos_temporales, turno_preferido: next } }, { transaction });
    return offerAvailability({ conversation, request, transaction, activity, now, availability });
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_NEW_DATE) {
    const parsed = parsePreferredDate(message, { now });
    if (!parsed.valid) return { responseText: 'No pudimos reconocer una fecha válida. Escríbela como 08/08/2026, mañana o próximo lunes.', responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual };
    await request.update({ fecha_solicitada: parsed.value, hora_inicio: null, hora_fin: null, paso_actual: CONVERSATION_STEPS.SEARCHING_AVAILABILITY, datos_temporales: cleanAvailability(request.datos_temporales), expira_en: null }, { transaction });
    await conversation.update({ paso_actual: CONVERSATION_STEPS.SEARCHING_AVAILABILITY, ...activity }, { transaction });
    return offerAvailability({ conversation, request, transaction, activity, now, availability });
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.NO_AVAILABILITY) {
    const option = Number(text);
    if (option === 1) {
      const result = await availability.findNextAvailableDate({ date: request.fecha_solicitada, preferredShift: request.datos_temporales?.turno_preferido, transaction, now, searchDays: getWhatsappAvailabilitySearchDays() });
      if (!result) return { responseText: `No encontramos horarios disponibles dentro de los próximos ${getWhatsappAvailabilitySearchDays()} días.\n\nPor favor, elige otra fecha o comunícate con recepción.`, responseKind: 'NO_NEXT_AVAILABILITY', conversationStep: conversation.paso_actual };
      await request.update({ fecha_solicitada: result.date }, { transaction });
      return offerAvailability({ conversation, request, transaction, activity, now, availability });
    }
    if (option === 2) {
      await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_DATE, ...activity }, { transaction });
      return { responseText: 'Indica la nueva fecha que prefieres.', responseKind: 'REQUEST_NEW_DATE', conversationStep: CONVERSATION_STEPS.WAITING_NEW_DATE };
    }
    if (option === 3 || option === 4) {
      await request.update({ estado: 'CANCELADA', paso_actual: 'CANCELADA', datos_temporales: cleanAvailability(request.datos_temporales), hora_inicio: null, hora_fin: null, cancelada_en: now, motivo_cancelacion: option === 3 ? 'Flujo abandonado desde el menú' : 'Cancelada por el usuario', expira_en: null }, { transaction });
      await conversation.update({ paso_actual: option === 3 ? CONVERSATION_STEPS.WAITING_OPTION : conversation.paso_actual, ...(option === 4 ? { estado: 'CANCELADA' } : {}), contexto: {}, ...activity }, { transaction });
      return { responseText: 'La solicitud fue cancelada.\n\nNo se creó ninguna cita.\n\nCuando quieras comenzar nuevamente, escribe MENÚ.', responseKind: 'REQUEST_CANCELLED', conversationStep: conversation.paso_actual };
    }
    return { responseText: NO_SLOTS_MESSAGE, responseKind: 'INVALID_OPTION', conversationStep: conversation.paso_actual };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_SLOT_SELECTION) {
    const availabilityData = request.datos_temporales?.availability;
    if (!availabilityData || new Date(availabilityData.expires_at) <= now) {
      console.info('[WhatsApp] Opciones expiradas');
      return offerAvailability({ conversation, request, transaction, activity, now, availability });
    }
    const slot = availabilityData.slots.find((item) => item.option === Number(text));
    if (!slot) return { responseText: slotsMessage(request.fecha_solicitada, availabilityData.slots), responseKind: 'INVALID_OPTION', conversationStep: conversation.paso_actual };
    console.info('[WhatsApp] Opción de horario recibida');
    const free = await availability.revalidateSlotCapacity({ slot, transaction, now });
    if (!free) {
      console.info('[WhatsApp] Horario dejó de tener capacidad');
      return offerAvailability({ conversation, request, transaction, activity, now, availability });
    }
    const nextAvailability = { ...availabilityData, selected_slot: slot };
    await request.update({ fecha_solicitada: slot.date, hora_inicio: slot.start, hora_fin: slot.end, estado: 'PENDIENTE_CONFIRMACION', paso_actual: CONVERSATION_STEPS.SLOT_SELECTED, datos_temporales: { ...request.datos_temporales, availability: nextAvailability }, expira_en: null }, { transaction });
    await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION, ...activity }, { transaction });
    console.info('[WhatsApp] Solicitud actualizada con horario');
    const { finalSummary } = require('./whatsappAppointmentConfirmation.service');
    return { responseText: finalSummary(conversation, request), responseKind: 'FINAL_CONFIRMATION_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_FINAL_CONFIRMATION };
  }
  return null;
};

module.exports = { availabilitySteps, ERROR_MESSAGE, MISSING_MESSAGE, NO_SLOTS_MESSAGE, help, slotsMessage, offerAvailability, processAvailabilityStep, cancelAvailabilityRequest };
