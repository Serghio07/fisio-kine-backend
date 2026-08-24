const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Cita, Paciente, WhatsappAppointmentReminder, WhatsappConversacion, WhatsappEvento } = require('../models');
const { CONVERSATION_STATUS, CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');
const { normalizePhoneNumber } = require('../utils/phone');
const { sanitizeFirstName } = require('./whatsappAppointmentRequest.service');
const { sendTemplateMessage } = require('./whatsapp.service');
const { isMinorByBirthDate, resolveReminderRecipient } = require('./patientAdministrativeContact.service');
const config = require('../config/whatsapp');
const incidentService=require('./whatsappIncident.service');
const incidentSafe=(data)=>incidentService.createOrIncrement(data).catch(()=>console.error('[WhatsApp Monitoring] Error procesando monitoreo'));

const ELIGIBLE_STATES = Object.freeze(['Pendiente', 'Programada', 'Confirmada']);
const appointmentInstant = (item) => new Date(`${item.fecha}T${String(item.hora_inicio).slice(0, 8)}-04:00`);
const buildReminderKey = (appointmentId, scheduledAt) => `appointment-reminder:${appointmentId}:CITA_PROXIMA:${scheduledAt.toISOString()}`;
const classifyError = (result) => {
  if (['TIMEOUT', 'NETWORK_ERROR'].includes(String(result.code)) || Number(result.status) >= 500 || Number(result.status) === 429) return 'TRANSITORIO';
  return 'PERMANENTE';
};
const humanDate = (date) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const dueWindow = (now) => { const half = config.getWhatsappReminderWindowMinutes() * 30000; return [new Date(now.getTime() - half), new Date(now.getTime() + half)]; };
const boliviaDate = (date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const findAppointmentsDueForReminder = async ({ now = new Date(), appointmentModel = Cita, transaction } = {}) => {
  const hours = config.getWhatsappReminderHoursBefore(); const [from, to] = dueWindow(now);
  const appointmentFrom = new Date(from.getTime() + hours * 3600000); const appointmentTo = new Date(to.getTime() + hours * 3600000);
  const dates = [...new Set([boliviaDate(appointmentFrom), boliviaDate(appointmentTo)])];
  const rows = await appointmentModel.findAll({ attributes: ['id', 'paciente_id', 'fecha', 'hora_inicio', 'hora_fin', 'estado'], where: { fecha: { [Op.in]: dates }, estado: { [Op.in]: ELIGIBLE_STATES } }, include: [{ model: Paciente, as: 'paciente', required: true, attributes: ['id', 'nombres', 'apellidos', 'fecha_nacimiento', 'telefono', 'telefono_normalizado', 'estado', 'registro_pendiente'], where: { estado: true } }], transaction });
  return rows.filter((item) => { const instant = appointmentInstant(item); const target = new Date(instant.getTime() - hours * 3600000); return instant > now && target >= from && target <= to; });
};

const createDueReminderRecords = async ({ now = new Date(), appointmentModel = Cita, reminderModel = WhatsappAppointmentReminder, recipientResolver = resolveReminderRecipient, transaction } = {}) => {
  console.info('[WhatsApp] Buscando recordatorios pendientes');
  const appointments = await findAppointmentsDueForReminder({ now, appointmentModel, transaction });
  console.info('[WhatsApp] Citas elegibles encontradas');
  const records = [];
  for (const item of appointments) {
    const scheduledAt = new Date(appointmentInstant(item).getTime() - config.getWhatsappReminderHoursBefore() * 3600000);
    let recipient;
    try { recipient = await recipientResolver(item.paciente, { transaction }); }
    catch (_) {
      recipient = { normalizedPhone: null, source: isMinorByBirthDate(item.paciente?.fecha_nacimiento) ? 'CONTACTO' : 'PACIENTE', reason: 'ERROR_RESOLVIENDO_DESTINATARIO' };
      console.error('[WhatsApp] No se pudo resolver destinatario de recordatorio');
    }
    const hasDestination = Boolean(recipient?.normalizedPhone);
    const values = {
      cita_id: item.id, paciente_id: item.paciente_id,
      contacto_id: recipient?.contactId || null,
      telefono_normalizado: hasDestination ? recipient.normalizedPhone : null,
      telefono_fuente: recipient?.source || 'PACIENTE',
      parentesco_snapshot: recipient?.relationship || null,
      destinatario_nombre_snapshot: recipient?.recipientName || null,
      programado_para: scheduledAt, cita_fecha: item.fecha, cita_hora_inicio: item.hora_inicio,
      cita_hora_fin: item.hora_fin, cita_estado: item.estado,
      estado: hasDestination ? 'PENDIENTE' : 'SIN_DESTINATARIO',
      proximo_intento_en: hasDestination ? now : null,
      error_codigo: hasDestination ? null : String(recipient?.reason || 'SIN_DESTINATARIO').slice(0, 100),
      error_categoria: hasDestination ? null : 'PERMANENTE',
      error_resumen: hasDestination ? null : 'No existe un destinatario autorizado con teléfono válido',
      idempotency_key: buildReminderKey(item.id, scheduledAt)
    };
    const [record] = await reminderModel.findOrCreate({ where: { idempotency_key: values.idempotency_key }, defaults: values, transaction }); records.push(record);
  }
  return records;
};

const claimReminder = async ({ now = new Date(), reminderModel = WhatsappAppointmentReminder, transaction }) => {
  const reminder = await reminderModel.findOne({ where: { estado: { [Op.in]: ['PENDIENTE', 'REINTENTO'] }, proximo_intento_en: { [Op.lte]: now }, intentos: { [Op.lt]: config.getWhatsappReminderMaxAttempts() } }, order: [['proximo_intento_en', 'ASC'], ['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true });
  if (!reminder) return null;
  await reminder.update({ estado: 'PROCESANDO', intentos: Number(reminder.intentos) + 1, ultimo_intento_en: now }, { transaction });
  console.info('[WhatsApp] Recordatorio reclamado'); return reminder;
};

const activateReminderConversation = async ({ reminder, appointment, patient, now, conversationModel = WhatsappConversacion, transaction }) => {
  let conversation = await conversationModel.findOne({ where: { telefono: reminder.telefono_normalizado, estado: CONVERSATION_STATUS.ACTIVE }, transaction, lock: transaction.LOCK.UPDATE });
  const context = { patient_reference: { id: patient.id, first_name: sanitizeFirstName(patient.nombres) }, appointment_reminder: { reminder_id: reminder.id, appointment_id: appointment.id, sent_at: now.toISOString(), expires_at: new Date(now.getTime() + config.getWhatsappReminderResponseTimeoutHours() * 3600000).toISOString() } };
  const data = { paciente_id: patient.id, tipo_contacto: CONTACT_TYPES.EXISTING, estado: CONVERSATION_STATUS.ACTIVE, paso_actual: CONVERSATION_STEPS.WAITING_REMINDER_RESPONSE, opcion_principal: null, contexto: context, ultimo_mensaje_en: now, expira_en: new Date(now.getTime() + config.getWhatsappReminderResponseTimeoutHours() * 3600000) };
  if (conversation) await conversation.update(data, { transaction }); else conversation = await conversationModel.create({ telefono: reminder.telefono_normalizado, ...data }, { transaction });
  return conversation;
};

const processOneClaimedReminder = async ({ reminder, now = new Date(), appointmentModel = Cita, patientModel = Paciente, reminderModel = WhatsappAppointmentReminder, conversationModel = WhatsappConversacion, eventModel = WhatsappEvento, sender = sendTemplateMessage, db = sequelize }) => {
  const template = config.getWhatsappReminderTemplate();
  const appointment = await appointmentModel.findByPk(reminder.cita_id, { include: [{ model: patientModel, as: 'paciente', attributes: ['id', 'nombres', 'apellidos', 'estado', 'registro_pendiente'] }] });
  const patient = appointment?.paciente; const validPhone = Boolean(normalizePhoneNumber(reminder.telefono_normalizado));
  if (!appointment || !patient || !validPhone || patient.estado !== true || appointment.paciente_id !== reminder.paciente_id || !ELIGIBLE_STATES.includes(appointment.estado) || appointmentInstant(appointment) <= now || appointment.fecha !== reminder.cita_fecha || String(appointment.hora_inicio).slice(0, 5) !== String(reminder.cita_hora_inicio).slice(0, 5)) {
    await reminder.update({ estado: 'CANCELADO', error_codigo: 'APPOINTMENT_NOT_ELIGIBLE', error_categoria: 'PERMANENTE', error_resumen: 'La cita o el paciente dejaron de ser elegibles' }); console.info('[WhatsApp] Recordatorio cancelado por estado de cita'); return 'cancelled';
  }
  if (!template.name || !template.language) { await reminder.update({ estado: 'FALLIDO', error_codigo: 'TEMPLATE_NOT_CONFIGURED', error_categoria: 'PERMANENTE', error_resumen: 'Plantilla de recordatorio no configurada' }); if(reminder.id)await incidentSafe({type:'RECORDATORIO_FALLIDO',severity:'ERROR',entityType:'RECORDATORIO',entityId:reminder.id,reminderId:reminder.id,code:'TEMPLATE_NOT_CONFIGURED',summary:'Plantilla de recordatorio no configurada',category:'PERMANENTE',recoverable:false,attempts:reminder.intentos,idempotencyKey:`reminder-failed:${reminder.id}:TEMPLATE_NOT_CONFIGURED:${reminder.intentos}`}); return 'configuration_error'; }
  console.info('[WhatsApp] Enviando recordatorio');
  const name = sanitizeFirstName(patient.nombres) || 'Paciente';
  const result = await sender(reminder.telefono_normalizado, template, [name, humanDate(appointment.fecha), `${String(appointment.hora_inicio).slice(0, 5)}${appointment.hora_fin ? ` a ${String(appointment.hora_fin).slice(0, 5)}` : ''}`]);
  if (result.success) {
    await db.transaction(async (transaction) => { const locked = await reminderModel.findByPk(reminder.id, { transaction, lock: transaction.LOCK.UPDATE }); const conversational = locked.telefono_fuente !== 'CONTACTO'; const expiry = new Date(now.getTime() + config.getWhatsappReminderResponseTimeoutHours() * 3600000); await locked.update({ estado: 'ACEPTADO', meta_message_id: result.messageId, aceptado_en: now, expira_respuesta_en: expiry, error_codigo: null, error_categoria: null, error_resumen: null }, { transaction }); if (conversational) await activateReminderConversation({ reminder: locked, appointment, patient, now, conversationModel, transaction }); await eventModel.create({ meta_message_id: result.messageId, cita_id: appointment.id, solicitud_id: null, telefono: reminder.telefono_normalizado, direccion: 'SALIENTE', tipo_evento: 'RECORDATORIO_ENVIADO', estado: 'ENVIADO', datos: { reminder_id: Number(reminder.id), patient_id: Number(reminder.paciente_id), contact_id: reminder.contacto_id ? Number(reminder.contacto_id) : null, phone_source: reminder.telefono_fuente, template_language: template.language }, enviado_en: now }, { transaction }); });
    await incidentService.markRecovered({type:'RECORDATORIO',entityId:reminder.id}).catch(()=>{}); console.info('[WhatsApp] Recordatorio aceptado por Meta'); return 'accepted';
  }
  const category = classifyError(result); const maxed = Number(reminder.intentos) >= config.getWhatsappReminderMaxAttempts();
  await reminder.update({ estado: category === 'TRANSITORIO' && !maxed ? 'REINTENTO' : 'FALLIDO', proximo_intento_en: category === 'TRANSITORIO' && !maxed ? new Date(now.getTime() + config.getWhatsappReminderRetryMinutes() * 60000) : null, error_codigo: String(result.code || 'META_ERROR').slice(0, 100), error_categoria: category, error_resumen: String(result.message || 'Error de envío').slice(0, 500) });
  if(reminder.id&&(category!=='TRANSITORIO'||maxed))await incidentSafe({type:'RECORDATORIO_FALLIDO',severity:'ERROR',entityType:'RECORDATORIO',entityId:reminder.id,reminderId:reminder.id,code:String(result.code||'META_ERROR'),summary:String(result.message||'Error de envío'),category,recoverable:false,attempts:reminder.intentos,idempotencyKey:`reminder-failed:${reminder.id}:${String(result.code||'META_ERROR')}:${reminder.intentos}`});
  console.info(category === 'TRANSITORIO' && !maxed ? '[WhatsApp] Reintento de recordatorio programado' : '[WhatsApp] Recordatorio marcado como fallido'); return 'failed';
};

const processDueAppointmentReminders = async (options = {}) => {
  if (!config.getWhatsappRemindersEnabled()) return { disabled: true, processed: 0 };
  const db = options.db || sequelize; const now = options.now || new Date();
  await db.transaction((transaction) => createDueReminderRecords({ ...options, now, transaction }));
  let processed = 0;
  while (processed < (options.limit || 20)) { const reminder = await db.transaction((transaction) => claimReminder({ ...options, now, transaction })); if (!reminder) break; try { await processOneClaimedReminder({ ...options, reminder, now, db }); } catch (_) { console.error('[WhatsApp] Error procesando recordatorio'); } processed += 1; }
  return { disabled: false, processed };
};

module.exports = { ELIGIBLE_STATES, appointmentInstant, boliviaDate, buildReminderKey, classifyError, findAppointmentsDueForReminder, createDueReminderRecords, claimReminder, processOneClaimedReminder, processDueAppointmentReminders };
