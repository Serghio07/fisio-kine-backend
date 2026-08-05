const { CONVERSATION_STATUS, CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');

const MESSAGES = Object.freeze({
  START_EXISTING: (firstName) => `${firstName ? `Perfecto, ${firstName}` : 'Perfecto'} 😊

Cuéntanos brevemente el motivo de tu consulta.

Ejemplo:
Dolor de rodilla desde hace una semana.

`,
  START_NEW: `¡Claro! 😊

Antes de continuar, ¿cuál es tu nombre y apellido?`,
  ASK_REASON: (name) => `Gracias, ${name}.\n\nAhora cuéntanos brevemente el motivo de tu consulta.\n\nEjemplo:\nDolor de espalda al caminar.`,
  ASK_DATE: (firstName) => `${firstName ? `Gracias, ${firstName}.` : 'Gracias.'}

Ahora indícanos la fecha en la que prefieres ser atendido.

Puedes escribir, por ejemplo:

- 08/08/2026
- 8 de agosto
- mañana
- próximo lunes

La fecha será una preferencia y todavía no representa una cita confirmada.`,
  INVALID_NAME: `No pude reconocer ese nombre.

Escribe tu nombre y apellido usando solo letras.

Ejemplo:
María Fernández`,
  INVALID_REASON: `No pude reconocer el motivo.

Escríbelo brevemente con al menos 5 caracteres.

Ejemplo:
Dolor en el hombro al mover el brazo.`,
  INVALID_DATE: `No pude reconocer esa fecha.

Puedes escribir, por ejemplo:

- mañana
- jueves
- próximo lunes
- 12/08/2026`,
  PAST_DATE: `Esa fecha ya pasó 😊

Elige uno de los próximos días disponibles.`,
  SUNDAY: `Los domingos no tenemos atención.

Elige una fecha de lunes a sábado.`,
  INVALID_TIME: `El horario indicado está fuera del horario de atención.

Horarios disponibles para solicitar:

Lunes a viernes:
09:00 a 12:30
15:00 a 19:30

Sábados:
09:00 a 12:30

Recuerda que la disponibilidad se confirmará posteriormente.`,
  CANCELLED: `La solicitud fue cancelada.

No se creó ninguna cita ni solicitud.

Cuando quieras comenzar nuevamente, escribe MENÚ.`,
  ALREADY_CREATED: `Esta solicitud ya fue registrada.

Escribe MENÚ para realizar otra operación.`,
  CREATE_ERROR: `No pudimos registrar tu solicitud en este momento.

Por favor, intenta nuevamente en unos minutos o escribe MENÚ.`
});

const cleanText = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const sanitizeFirstName = (value) => {
  const firstPart = cleanText(value).split(' ')[0] || '';
  return firstPart.replace(/[^\p{L}'-]/gu, '').slice(0, 50);
};
const validateContactName = (value) => {
  const normalized = cleanText(value);
  const valid = normalized.length >= 2 && normalized.length <= 100
    && !/https?:\/\/|www\./iu.test(normalized)
    && /^[\p{L}' -]+$/u.test(normalized);
  return { valid, value: valid ? normalized : '' };
};
const validateAppointmentReason = (value) => {
  const normalized = cleanText(value);
  const valid = normalized.length >= 5 && normalized.length <= 500
    && !/https?:\/\/|www\./iu.test(normalized)
    && /\p{L}/u.test(normalized);
  return { valid, value: valid ? normalized : '' };
};

const localDateParts = (now, timeZone = 'America/La_Paz') => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
};
const calendarDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const parsePreferredDate = (value, options = {}) => {
  const text = cleanText(value).toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const todayParts = localDateParts(options.now || new Date(), options.timeZone || 'America/La_Paz');
  const today = calendarDate(todayParts.year, todayParts.month, todayParts.day);
  const maxDays = Number.isInteger(options.maxDays) ? options.maxDays : 90;
  let parsed;
  let match;
  if (text === 'hoy') parsed = today;
  else if (text === 'mañana'.normalize('NFD').replace(/[\u0300-\u036f]/g, '') || text === 'manana') parsed = addDays(today, 1);
  else if (text === 'pasado manana') parsed = addDays(today, 2);
  else if ((match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) parsed = calendarDate(+match[3], +match[2], +match[1]);
  else if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/))) parsed = calendarDate(+match[1], +match[2], +match[3]);
  else {
    const months = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
    match = text.match(/^(\d{1,2})(?: de)? ([a-z]+)(?: (\d{4}))?$/);
    if (match && months[match[2]]) parsed = calendarDate(+(match[3] || todayParts.year), months[match[2]], +match[1]);
    if (!parsed) {
      const weekdays = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
      match = text.match(/^(?:(proximo|este) )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)$/);
      if (match) {
        const deltaRaw = (weekdays[match[2]] - today.getUTCDay() + 7) % 7;
        const delta = match[1] === 'proximo' ? (deltaRaw || 7) : deltaRaw;
        parsed = addDays(today, delta);
      }
    }
  }
  if (!parsed) return { valid: false, error: 'INVALID' };
  const difference = Math.round((parsed - today) / 86400000);
  if (difference < 0) return { valid: false, error: 'PAST' };
  if (difference > maxDays) return { valid: false, error: 'TOO_FAR' };
  if (parsed.getUTCDay() === 0) return { valid: false, error: 'SUNDAY' };
  return { valid: true, value: isoDate(parsed), isSaturday: parsed.getUTCDay() === 6 };
};

const parsePreferredTime = (value, isSaturday = false) => {
  const text = cleanText(value).toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return { valid: false, value: '' };
  let hour = +match[1]; const minute = +(match[2] || 0);
  if (minute > 59 || (match[3] && (hour < 1 || hour > 12))) return { valid: false, value: '' };
  if (match[3] === 'pm' && hour < 12) hour += 12;
  if (match[3] === 'am' && hour === 12) hour = 0;
  if (hour > 23) return { valid: false, value: '' };
  const total = hour * 60 + minute;
  const morning = total >= 540 && total <= 750;
  const afternoon = !isSaturday && total >= 900 && total <= 1170;
  return { valid: morning || afternoon, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
};

const humanDate = (value) => new Intl.DateTimeFormat('es-BO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const availableDatesMessage = (dates, firstName = '') => `${firstName ? `Gracias, ${firstName} 😊` : 'Gracias 😊'}\n\nEstos son los próximos días con disponibilidad:\n\n${dates.map((item, index) => `${index + 1}. ${humanDate(item.date)}`).join('\n')}\n${dates.length + 1}. Elegir otra fecha\n\nElige el número del día que prefieras.`;
const availableShiftPrompt = (date, shifts) => {
  const labels = shifts.map((shift, index) => `${index + 1}. ${shift === 'MANANA' ? 'Mañana' : 'Tarde'}`).join('\n');
  return `Perfecto 😊\n\n¿En qué turno prefieres tu cita para el ${humanDate(date)}?\n\n${labels}\n${shifts.length + 1}. Elegir otro día`;
};
const shiftPrompt = (date, isSaturday) => `¿Qué horario prefieres para el ${humanDate(date)}?\n\n${isSaturday ? 'Responde:\n\n1. Mañana\n2. Indicar una hora específica\n\nLos sábados no hay atención por la tarde.' : 'Responde con una opción:\n\n1. Mañana\n2. Tarde\n3. Indicar una hora específica'}`;
const scheduleLabel = (request) => request.preferred_time || (request.preferred_shift === 'MANANA' ? 'Mañana' : 'Tarde');
const buildSummary = (_contactType, request, firstName = '') => `${firstName ? `Revisa tu solicitud, ${firstName}:` : 'Revisa tu solicitud:'}\n\nMotivo:\n${request.reason}\n\nFecha preferida:\n${humanDate(request.preferred_date)}\n\nHorario preferido:\n${scheduleLabel(request)}\n\nEsta información es una solicitud y todavía no representa una cita confirmada.\n\nResponde:\n\n1. Confirmar solicitud\n2. Cambiar información\n3. Cancelar`;
const buildStepHelp = (step) => {
  const help = {
    [CONVERSATION_STEPS.WAITING_NAME]: 'Escribe únicamente tu nombre. Ejemplo: María Fernández.',
    [CONVERSATION_STEPS.WAITING_REASON]: 'Describe brevemente el motivo con al menos 5 caracteres.',
    [CONVERSATION_STEPS.WAITING_DATE]: 'Puedes escribir una fecha como 08/08/2026, mañana o próximo lunes.',
    [CONVERSATION_STEPS.WAITING_SHIFT]: 'Responde con una opción del menú de horarios.',
    [CONVERSATION_STEPS.WAITING_TIME]: 'Escribe una hora como 09:30 o 3:00 pm.',
    [CONVERSATION_STEPS.WAITING_CONFIRMATION]: 'Responde 1 para confirmar, 2 para cambiar información o 3 para cancelar.',
    [CONVERSATION_STEPS.WAITING_EDIT_FIELD]: 'Selecciona el dato que deseas cambiar.'
  };
  return `${help[step] || 'Continúa con el dato solicitado.'}\n\nEscribe MENÚ para volver al inicio o CANCELAR para terminar.`;
};

const appointmentSteps = new Set([
  CONVERSATION_STEPS.START_BOOKING, CONVERSATION_STEPS.WAITING_NAME,
  CONVERSATION_STEPS.WAITING_REASON, CONVERSATION_STEPS.WAITING_DATE,
  CONVERSATION_STEPS.WAITING_SHIFT, CONVERSATION_STEPS.WAITING_TIME,
  CONVERSATION_STEPS.WAITING_CONFIRMATION, CONVERSATION_STEPS.WAITING_EDIT_FIELD
]);

const processAppointmentStep = async ({ conversation, message, requestModel, transaction, activity, now = activity.ultimo_mensaje_en, availability }) => {
  const context = { ...(conversation.contexto || {}) };
  const request = { ...(context.appointment_request || {}) };
  const firstName = sanitizeFirstName(context.contact_first_name || request.contact_name);
  const update = (data) => conversation.update(data, { transaction });
  const goSummary = async () => {
    delete context.return_to_summary;
    delete context.editing_field;
    context.appointment_request = request;
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION, contexto: context, ...activity });
    console.info('[WhatsApp] Resumen de solicitud generado');
    return { responseText: buildSummary(conversation.tipo_contacto, request, firstName), responseKind: 'REQUEST_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_CONFIRMATION };
  };

  if (conversation.paso_actual === CONVERSATION_STEPS.START_BOOKING) {
    const next = conversation.tipo_contacto === CONTACT_TYPES.NEW ? CONVERSATION_STEPS.WAITING_NAME : CONVERSATION_STEPS.WAITING_REASON;
    await update({ paso_actual: next, contexto: { ...context, appointment_request: {} }, ...activity });
    console.info('[WhatsApp] Flujo de solicitud iniciado');
    return { responseText: conversation.tipo_contacto === CONTACT_TYPES.NEW ? MESSAGES.START_NEW : MESSAGES.START_EXISTING(firstName), responseKind: 'REQUEST_STARTED', conversationStep: next };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_NAME) {
    const result = validateContactName(message);
    if (!result.valid) { await update(activity); return { responseText: MESSAGES.INVALID_NAME, responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    request.contact_name = result.value; context.contact_first_name = sanitizeFirstName(result.value); context.appointment_request = request;
    console.info('[WhatsApp] Nombre temporal validado');
    if (context.return_to_summary) return goSummary();
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_REASON, contexto: context, ...activity });
    return { responseText: MESSAGES.ASK_REASON(context.contact_first_name), responseKind: 'REQUEST_DATA', conversationStep: CONVERSATION_STEPS.WAITING_REASON };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_REASON) {
    const result = validateAppointmentReason(message);
    if (!result.valid) { await update(activity); return { responseText: MESSAGES.INVALID_REASON, responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    request.reason = result.value; context.appointment_request = request;
    console.info('[WhatsApp] Motivo validado');
    if (context.return_to_summary) return goSummary();
    if (availability?.findAvailableDates) {
      const dates = await availability.findAvailableDates({ date: availability.todayIso(now), now, transaction, limit: 4 });
      context.available_dates = dates;
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_DATE, contexto: context, ...activity });
      return { responseText: dates.length ? availableDatesMessage(dates, firstName) : 'No encontramos horarios disponibles en los próximos días.\n\nPuedes escribir otra fecha o MENÚ para volver al inicio.', responseKind: 'AVAILABLE_DATES', conversationStep: CONVERSATION_STEPS.WAITING_DATE };
    }
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_DATE, contexto: context, ...activity });
    return { responseText: MESSAGES.ASK_DATE(firstName), responseKind: 'REQUEST_DATA', conversationStep: CONVERSATION_STEPS.WAITING_DATE };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_DATE) {
    const offered = Array.isArray(context.available_dates) ? context.available_dates : [];
    const numeric = Number(cleanText(message));
    if (offered.length && numeric === offered.length + 1) {
      await update(activity);
      return { responseText: MESSAGES.ASK_DATE(firstName), responseKind: 'REQUEST_NEW_DATE', conversationStep: conversation.paso_actual };
    }
    const selected = offered[numeric - 1];
    const result = selected ? { valid: true, value: selected.date, isSaturday: new Date(`${selected.date}T00:00:00Z`).getUTCDay() === 6 } : parsePreferredDate(message, { now });
    if (!result.valid) { await update(activity); return { responseText: result.error === 'PAST' ? MESSAGES.PAST_DATE : result.error === 'SUNDAY' ? MESSAGES.SUNDAY : MESSAGES.INVALID_DATE, responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    request.preferred_date = result.value; request.preferred_shift = null; request.preferred_time = null;
    context.appointment_request = request; context.selected_date_is_saturday = result.isSaturday;
    if (availability?.getAvailableSlots) {
      const available = await availability.getAvailableSlots({ date: result.value, now, transaction, maxSlots: 30 });
      if (!available.slots.length) {
        const alternatives = await availability.findAvailableDates({ date: availability.addDays(result.value, 1), now, transaction, limit: 4 });
        context.available_dates = alternatives;
        await update({ contexto: context, ...activity });
        return { responseText: `Ese día ya no tiene horarios disponibles.\n\n${alternatives.length ? availableDatesMessage(alternatives) : 'Escribe otra fecha para continuar.'}`, responseKind: 'NO_AVAILABILITY', conversationStep: conversation.paso_actual };
      }
      const shifts = [...new Set(available.slots.map((slot) => slot.shift))];
      context.available_shifts = shifts;
      if (result.isSaturday) {
        request.preferred_shift = 'MANANA';
        context.appointment_request = request;
        await update({ paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION, contexto: context, ...activity });
        return processAppointmentStep({ conversation, message: '1', requestModel, transaction, activity, now, availability });
      }
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_SHIFT, contexto: context, ...activity });
      return { responseText: availableShiftPrompt(result.value, shifts), responseKind: 'AVAILABLE_SHIFTS', conversationStep: CONVERSATION_STEPS.WAITING_SHIFT };
    }
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_SHIFT, contexto: context, ...activity });
    console.info('[WhatsApp] Fecha preferida validada');
    return { responseText: shiftPrompt(result.value, result.isSaturday), responseKind: 'REQUEST_DATA', conversationStep: CONVERSATION_STEPS.WAITING_SHIFT };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_SHIFT) {
    const text = cleanText(message).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const saturday = Boolean(context.selected_date_is_saturday);
    const availableShifts = Array.isArray(context.available_shifts) ? context.available_shifts : null;
    if (availableShifts && (text === 'otro dia' || Number(text) === availableShifts.length + 1)) {
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_DATE, ...activity });
      return { responseText: availableDatesMessage(context.available_dates || [], firstName), responseKind: 'AVAILABLE_DATES', conversationStep: CONVERSATION_STEPS.WAITING_DATE };
    }
    let choice = availableShifts ? (availableShifts[Number(text) - 1] || (text === 'manana' && availableShifts.includes('MANANA') ? 'MANANA' : text === 'tarde' && availableShifts.includes('TARDE') ? 'TARDE' : '')) : text === 'manana' || text === '1' ? 'MANANA' : text === 'tarde' || (!saturday && text === '2') ? 'TARDE' : text === 'hora especifica' || (saturday ? text === '2' : text === '3') ? 'HORA_ESPECIFICA' : '';
    if (!choice || (saturday && choice === 'TARDE')) { await update(activity); return { responseText: shiftPrompt(request.preferred_date, saturday), responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    request.preferred_shift = choice; request.preferred_time = null; context.appointment_request = request;
    if (choice === 'HORA_ESPECIFICA') {
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_TIME, contexto: context, ...activity });
      return { responseText: 'Indica la hora que prefieres.\n\nEjemplo: 09:30 o 3:00 pm.', responseKind: 'REQUEST_DATA', conversationStep: CONVERSATION_STEPS.WAITING_TIME };
    }
    console.info('[WhatsApp] Turno preferido validado');
    if (availableShifts) {
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_CONFIRMATION, contexto: context, ...activity });
      return processAppointmentStep({ conversation, message: '1', requestModel, transaction, activity, now, availability });
    }
    return goSummary();
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_TIME) {
    const result = parsePreferredTime(message, Boolean(context.selected_date_is_saturday));
    if (!result.valid) { await update(activity); return { responseText: MESSAGES.INVALID_TIME, responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    request.preferred_time = result.value; request.preferred_shift = 'HORA_ESPECIFICA'; context.appointment_request = request;
    console.info('[WhatsApp] Hora preferida validada');
    return goSummary();
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_EDIT_FIELD) {
    const option = Number(cleanText(message));
    const fresh = conversation.tipo_contacto === CONTACT_TYPES.NEW;
    const mapping = fresh
      ? { 1: CONVERSATION_STEPS.WAITING_NAME, 2: CONVERSATION_STEPS.WAITING_REASON, 3: CONVERSATION_STEPS.WAITING_DATE, 4: CONVERSATION_STEPS.WAITING_SHIFT }
      : { 1: CONVERSATION_STEPS.WAITING_REASON, 2: CONVERSATION_STEPS.WAITING_DATE, 3: CONVERSATION_STEPS.WAITING_SHIFT };
    const summaryOption = fresh ? 5 : 4;
    if (option === summaryOption) return goSummary();
    if (!mapping[option]) { await update(activity); return { responseText: fresh ? 'Responde con una opción del 1 al 5.' : 'Responde con una opción del 1 al 4.', responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    context.return_to_summary = ![CONVERSATION_STEPS.WAITING_DATE, CONVERSATION_STEPS.WAITING_SHIFT].includes(mapping[option]);
    context.appointment_request = request;
    await update({ paso_actual: mapping[option], contexto: context, ...activity });
    console.info('[WhatsApp] Dato de solicitud modificado');
    const prompts = { [CONVERSATION_STEPS.WAITING_NAME]: 'Escribe nuevamente tu nombre.', [CONVERSATION_STEPS.WAITING_REASON]: 'Escribe nuevamente el motivo.', [CONVERSATION_STEPS.WAITING_DATE]: MESSAGES.ASK_DATE(firstName), [CONVERSATION_STEPS.WAITING_SHIFT]: shiftPrompt(request.preferred_date, Boolean(context.selected_date_is_saturday)) };
    return { responseText: prompts[mapping[option]], responseKind: 'REQUEST_EDIT', conversationStep: mapping[option] };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_CONFIRMATION) {
    const option = Number(cleanText(message));
    if (option === 2) {
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_EDIT_FIELD, ...activity });
      const fresh = conversation.tipo_contacto === CONTACT_TYPES.NEW;
      return { responseText: `¿Qué información deseas cambiar?\n\n${fresh ? '1. Nombre\n2. Motivo\n3. Fecha\n4. Horario\n5. Volver al resumen' : '1. Motivo\n2. Fecha\n3. Horario\n4. Volver al resumen'}`, responseKind: 'REQUEST_EDIT', conversationStep: CONVERSATION_STEPS.WAITING_EDIT_FIELD };
    }
    if (option === 3) {
      await update({ estado: CONVERSATION_STATUS.CANCELLED, contexto: {}, ...activity });
      console.info('[WhatsApp] Solicitud cancelada');
      return { responseText: MESSAGES.CANCELLED, responseKind: 'REQUEST_CANCELLED', conversationStep: conversation.paso_actual };
    }
    if (option !== 1) { await update(activity); return { responseText: buildSummary(conversation.tipo_contacto, request, firstName), responseKind: 'INVALID_REQUEST_DATA', conversationStep: conversation.paso_actual }; }
    if (context.request_id || conversation.paso_actual === CONVERSATION_STEPS.REQUEST_CREATED) return { responseText: MESSAGES.ALREADY_CREATED, responseKind: 'REQUEST_ALREADY_CREATED', conversationStep: CONVERSATION_STEPS.REQUEST_CREATED };
    const required = ['reason', 'preferred_date', 'preferred_shift'];
    if (conversation.tipo_contacto === CONTACT_TYPES.NEW) required.unshift('contact_name');
    const missing = required.find((field) => !request[field]);
    if (missing) {
      const steps = { contact_name: CONVERSATION_STEPS.WAITING_NAME, reason: CONVERSATION_STEPS.WAITING_REASON, preferred_date: CONVERSATION_STEPS.WAITING_DATE, preferred_shift: CONVERSATION_STEPS.WAITING_SHIFT };
      await update({ paso_actual: steps[missing], ...activity });
      return { responseText: 'Falta información para completar la solicitud. Por favor, continúa con el dato solicitado.', responseKind: 'INCOMPLETE_REQUEST', conversationStep: steps[missing] };
    }
    let created;
    try {
      created = await requestModel.create({
      telefono: conversation.telefono,
      nombre_whatsapp: conversation.tipo_contacto === CONTACT_TYPES.NEW ? request.contact_name : null,
      paciente_id: conversation.tipo_contacto === CONTACT_TYPES.EXISTING ? conversation.paciente_id : null,
      cita_id: null,
      tipo_solicitud: 'AGENDAR',
      estado: 'PENDIENTE_CONFIRMACION',
      paso_actual: 'SOLICITUD_CREADA',
      datos_temporales: { origen: 'WHATSAPP', turno_preferido: request.preferred_shift, hora_preferida: request.preferred_time || null, conversation_id: conversation.id },
      motivo: request.reason,
      fecha_solicitada: request.preferred_date,
      hora_inicio: request.preferred_time || null,
      hora_fin: null,
      confirmacion: null,
      intentos: 0,
      ultimo_evento_en: activity.ultimo_mensaje_en,
      expira_en: null
      }, { transaction });
    } catch (error) {
      console.error('[WhatsApp] Error al crear solicitud');
      const requestError = new Error('APPOINTMENT_REQUEST_CREATE_FAILED');
      requestError.code = 'APPOINTMENT_REQUEST_CREATE_FAILED';
      requestError.cause = error;
      throw requestError;
    }
    await update({ paso_actual: CONVERSATION_STEPS.REQUEST_CREATED, contexto: { request_id: created.id, ...(firstName ? { contact_first_name: firstName } : {}) }, ...activity });
    console.info('[WhatsApp] Solicitud temporal creada');
    return { responseText: `${firstName ? `${firstName}, tu solicitud` : 'Tu solicitud'} fue registrada correctamente. ✅\n\nAhora revisaremos los horarios disponibles.\n\nImportante: todavía no es una cita confirmada.`, responseKind: 'REQUEST_CREATED', conversationStep: CONVERSATION_STEPS.REQUEST_CREATED, requestCreated: created };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.REQUEST_CREATED) return { responseText: MESSAGES.ALREADY_CREATED, responseKind: 'REQUEST_ALREADY_CREATED', conversationStep: CONVERSATION_STEPS.REQUEST_CREATED };
  return null;
};

module.exports = {
  MESSAGES, appointmentSteps, cleanText, sanitizeFirstName, validateContactName, validateAppointmentReason,
  parsePreferredDate, parsePreferredTime, buildSummary, buildStepHelp, availableDatesMessage, availableShiftPrompt, processAppointmentStep
};
