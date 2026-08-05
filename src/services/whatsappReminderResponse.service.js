const { Cita, WhatsappAppointmentReminder } = require('../models');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');
const availability = require('./appointmentAvailability.service');
const { cleanText, sanitizeFirstName } = require('./whatsappAppointmentRequest.service');
const { ELIGIBLE_STATES, appointmentInstant } = require('./appointmentReminder.service');
const { createOrReuseReceptionReferral } = require('./whatsappReceptionReferral.service');

const reminderSteps = new Set([CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION, CONVERSATION_STEPS.ATTENDANCE_CONFIRMED, CONVERSATION_STEPS.REMINDER_REFERRED_RECEPTION]);
const normalize = (value) => cleanText(value).toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const humanDate = (date) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const slotText = (item) => `${String(item.hora_inicio).slice(0, 5)}${item.hora_fin ? ` a ${String(item.hora_fin).slice(0, 5)}` : ''}`;
const nameFor = (conversation) => sanitizeFirstName(conversation.contexto?.patient_reference?.first_name);
const originalSlot = (item) => ({ date: item.fecha, start: String(item.hora_inicio).slice(0, 5), end: item.hora_fin ? String(item.hora_fin).slice(0, 5) : null, status: item.estado, updated_at: new Date(item.updated_at).toISOString() });
const responseMenu = '¿Qué deseas hacer?\n\n1. Confirmar asistencia\n2. No podré asistir\n3. Reprogramar\n4. Hablar con recepción';
const help = (step) => step === CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION ? 'Responde 1 para confirmar cancelación, 2 para reprogramar, 3 para mantener la cita o 4 para hablar con recepción. Escribir CANCELAR conserva la cita.' : responseMenu;

const loadContext = async ({ conversation, reminderModel, appointmentModel, transaction, now }) => {
  const reference = conversation.contexto?.appointment_reminder;
  if (!reference?.reminder_id || !reference?.appointment_id || conversation.tipo_contacto !== CONTACT_TYPES.EXISTING || !conversation.paciente_id) return { error: 'MISSING' };
  const reminder = await reminderModel.findByPk(reference.reminder_id, { transaction, lock: transaction.LOCK.UPDATE });
  const appointment = await appointmentModel.findOne({ where: { id: reference.appointment_id, paciente_id: conversation.paciente_id }, transaction, lock: transaction.LOCK.UPDATE });
  if (!reminder || !appointment || reminder.cita_id !== appointment.id || reminder.paciente_id !== conversation.paciente_id || reminder.telefono_normalizado !== conversation.telefono) return { error: 'MISMATCH' };
  if (reminder.respondido_en || reminder.estado === 'RESPONDIDO') return { reminder, appointment, error: 'RESPONDED' };
  if (!reminder.expira_respuesta_en || new Date(reminder.expira_respuesta_en) <= now) { await reminder.update({ estado: 'EXPIRADO' }, { transaction }); return { reminder, appointment, error: 'EXPIRED' }; }
  if (!['ACEPTADO', 'ENVIADO', 'ENTREGADO', 'LEIDO'].includes(reminder.estado)) return { reminder, appointment, error: 'INACTIVE' };
  if (!ELIGIBLE_STATES.includes(appointment.estado) || appointmentInstant(appointment) <= now || appointment.fecha !== reminder.cita_fecha || String(appointment.hora_inicio).slice(0, 5) !== String(reminder.cita_hora_inicio).slice(0, 5)) return { reminder, appointment, error: 'CHANGED' };
  return { reminder, appointment };
};
const markResponse = (reminder, response, now, transaction) => reminder.update({ estado: 'RESPONDIDO', respuesta: response, respondido_en: now }, { transaction });
const completedContext = (conversation) => ({
  ...(conversation.contexto?.patient_reference ? { patient_reference: conversation.contexto.patient_reference } : {}),
  ...(conversation.contexto?.appointment_reminder ? { appointment_reminder: conversation.contexto.appointment_reminder } : {})
});
const reception = async ({ conversation, reminder, appointment, transaction, activity, now, referralModel }) => { const referral = await createOrReuseReceptionReferral({ conversation, type: 'RECORDATORIO_CITA', reminderId: reminder.id, appointmentId: appointment.id, transaction, referralModel, now }); await markResponse(reminder, 'RECEPCION', now, transaction); await conversation.update({ paso_actual: CONVERSATION_STEPS.REMINDER_REFERRED_RECEPTION, contexto: {}, ...activity }, { transaction }); return { responseText: `${referral.created ? 'Tu solicitud quedó pendiente de revisión por recepción.' : 'Tu solicitud ya está pendiente de revisión por recepción.'}\n\nNo se realizaron cambios en tu cita.\n\nEscribe MENÚ para volver al inicio.`, responseKind: referral.created ? 'REMINDER_RECEPTION_CREATED' : 'REMINDER_RECEPTION_REUSED', conversationStep: CONVERSATION_STEPS.REMINDER_REFERRED_RECEPTION }; };
const startReschedule = async ({ conversation, reminder, appointment, transaction, activity, now }) => {
  if (!appointment.hora_fin || availability.toMinutes(appointment.hora_fin) <= availability.toMinutes(appointment.hora_inicio)) return reception({ conversation, reminder, appointment, transaction, activity, now });
  await markResponse(reminder, 'REPROGRAMAR', now, transaction);
  await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE, contexto: { ...(conversation.contexto?.patient_reference ? { patient_reference: conversation.contexto.patient_reference } : {}), appointment_management: { mode: 'RESCHEDULE', appointment_id: appointment.id, original_slot: originalSlot(appointment) } }, ...activity }, { transaction });
  console.info('[WhatsApp] Reprogramación iniciada desde recordatorio');
  return { responseText: 'Indica la nueva fecha que prefieres para tu cita.\n\nPuedes escribir 08/08/2026, mañana o próximo lunes.\n\nTu cita original no se modificará hasta que confirmes un nuevo horario.', responseKind: 'REMINDER_RESCHEDULE_STARTED', conversationStep: CONVERSATION_STEPS.WAITING_RESCHEDULE_DATE };
};

const processReminderResponse = async ({ conversation, message, reminderModel = WhatsappAppointmentReminder, appointmentModel = Cita, referralModel, transaction, activity, now }) => {
  console.info('[WhatsApp] Respuesta de recordatorio recibida');
  const loaded = await loadContext({ conversation, reminderModel, appointmentModel, transaction, now });
  if (loaded.error === 'EXPIRED') return { responseText: 'El recordatorio anterior ya no está activo.\n\nEscribe MENÚ para consultar o gestionar tus citas.', responseKind: 'REMINDER_EXPIRED', conversationStep: conversation.paso_actual };
  if (loaded.error === 'RESPONDED') return { responseText: 'Este recordatorio ya fue respondido anteriormente.\n\nEscribe MENÚ para consultar tus citas.', responseKind: 'REMINDER_ALREADY_RESPONDED', conversationStep: conversation.paso_actual };
  if (loaded.error) return { responseText: 'La cita cambió o ya no está activa.\n\nNo se realizaron cambios. Escribe MENÚ para consultar tus citas actuales.', responseKind: 'REMINDER_INVALID', conversationStep: conversation.paso_actual };
  const { reminder, appointment } = loaded; const choice = normalize(message);
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE) {
    if (['1', 'confirmar', 'confirmo', 'si', 'asistire'].includes(choice)) {
      await markResponse(reminder, 'CONFIRMAR_ASISTENCIA', now, transaction); await conversation.update({ paso_actual: CONVERSATION_STEPS.ATTENDANCE_CONFIRMED, contexto: completedContext(conversation), ...activity }, { transaction }); console.info('[WhatsApp] Asistencia confirmada');
      const name = nameFor(conversation); return { responseText: `¡Gracias${name ? `, ${name}` : ''}! ✅\n\nConfirmamos tu asistencia. Te esperamos en Physio Active.`, responseKind: 'ATTENDANCE_CONFIRMED', conversationStep: CONVERSATION_STEPS.ATTENDANCE_CONFIRMED };
    }
    if (['2', 'no podre asistir', 'no asistire'].includes(choice)) { await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION, ...activity }, { transaction }); return { responseText: `Entendido${nameFor(conversation) ? `, ${nameFor(conversation)}` : ''}.\n\n¿Deseas cancelar esta cita?\n\nFecha:\n${humanDate(appointment.fecha)}\n\nHorario:\n${slotText(appointment)}\n\nResponde:\n\n1. Confirmar cancelación\n2. Reprogramar cita\n3. Mantener la cita\n4. Hablar con recepción`, responseKind: 'NONATTENDANCE_CONFIRMATION', conversationStep: CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION }; }
    if (choice === '3' || choice === 'reprogramar') return startReschedule({ conversation, reminder, appointment, transaction, activity, now });
    if (choice === '4') return reception({ conversation, reminder, appointment, transaction, activity, now, referralModel });
    return { responseText: responseMenu, responseKind: 'INVALID_REMINDER_OPTION', conversationStep: conversation.paso_actual };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_NONATTENDANCE_CONFIRMATION) {
    if (choice === '1') { await appointment.update({ estado: 'Cancelada', historial_programacion: [...(Array.isArray(appointment.historial_programacion) ? appointment.historial_programacion : []), { accion: 'CANCELACION_DESDE_RECORDATORIO', estado_anterior: appointment.estado, estado_nuevo: 'Cancelada', registrado_en: now.toISOString() }] }, { transaction }); await markResponse(reminder, 'CANCELAR_CITA', now, transaction); await conversation.update({ paso_actual: CONVERSATION_STEPS.APPOINTMENT_CANCELLED, contexto: {}, ...activity }, { transaction }); return { responseText: `Tu cita fue cancelada correctamente.\n\nEsperamos poder atenderte en otra ocasión 😊\n\nEscribe MENÚ para volver.`, responseKind: 'REMINDER_APPOINTMENT_CANCELLED', conversationStep: CONVERSATION_STEPS.APPOINTMENT_CANCELLED }; }
    if (choice === '2') return startReschedule({ conversation, reminder, appointment, transaction, activity, now });
    if (choice === '3') { await markResponse(reminder, 'MANTENER_CITA', now, transaction); await conversation.update({ paso_actual: CONVERSATION_STEPS.WAITING_OPTION, contexto: {}, ...activity }, { transaction }); return { responseText: 'Tu cita permanece sin cambios.\n\nEscribe MENÚ para realizar otra operación.', responseKind: 'APPOINTMENT_KEPT', conversationStep: CONVERSATION_STEPS.WAITING_OPTION }; }
    if (choice === '4') return reception({ conversation, reminder, appointment, transaction, activity, now, referralModel });
    return { responseText: help(conversation.paso_actual), responseKind: 'INVALID_REMINDER_OPTION', conversationStep: conversation.paso_actual };
  }
  return { responseText: 'Este recordatorio ya finalizó. Escribe MENÚ para continuar.', responseKind: 'REMINDER_FINISHED', conversationStep: conversation.paso_actual };
};
module.exports = { reminderSteps, responseMenu, help, processReminderResponse };
