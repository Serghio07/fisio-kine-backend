const { Op } = require('sequelize');
const { Paciente, Contacto, PacienteContacto } = require('../models');
const { CONVERSATION_STEPS, CONTACT_TYPES } = require('../models/WhatsappConversacion');
const { normalizePhoneNumber } = require('../utils/phone');
const { validateContactName, sanitizeFirstName } = require('./whatsappAppointmentRequest.service');

const steps = new Set([
  CONVERSATION_STEPS.WAITING_PATIENT_TYPE, CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME,
  CONVERSATION_STEPS.WAITING_BIRTH_DATE, CONVERSATION_STEPS.WAITING_GUARDIAN_DATA,
  CONVERSATION_STEPS.WAITING_GUARDIAN_RELATIONSHIP, CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION
]);
const RELATIONSHIPS = ['PADRE','MADRE','TUTOR_LEGAL','ABUELO','ABUELA','HERMANO','HERMANA','CUIDADOR','APODERADO','OTRO'];
const relationText = RELATIONSHIPS.map((item, index) => `${index + 1}. ${item.replace('_', ' ')}`).join('\n');
const normalize = (value) => String(value || '').trim().toLocaleLowerCase('es-BO').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const splitName = (fullName) => { const parts = String(fullName).trim().split(/\s+/); return { nombres: parts.shift(), apellidos: parts.join(' ') || 'PENDIENTE' }; };
const parseBirthDate = (value, now) => {
  const match = String(value || '').trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]); const month = Number(match[2]); const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date > now) return null;
  let age = now.getUTCFullYear() - year;
  if (now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)) age -= 1;
  if (age < 0 || age > 120) return null;
  return { value: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, age, minor: age < 18 };
};
const summary = (data) => `Confirme los datos:\n\nPaciente: ${data.patient_name}\nFecha de nacimiento: ${data.birth_date_display}\n${data.minor ? `Responsable: ${data.guardian_name}\nParentesco: ${data.relationship.replace('_', ' ')}\n` : ''}\n1. Confirmar\n2. Corregir\n3. Cancelar`;

const processNewPatientStep = async ({ conversation, message, transaction, activity, now, models = {} }) => {
  const patientModel = models.patientModel || Paciente; const contactModel = models.contactModel || Contacto; const relationModel = models.relationModel || PacienteContacto;
  const context = { ...(conversation.contexto || {}) }; const data = { ...(context.new_patient || {}) };
  const update = (payload) => conversation.update(payload, { transaction });
  const text = normalize(message);
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_PATIENT_TYPE) {
    const type = ['1','para mi','para mí'].includes(text) ? 'SELF' : ['2','para otra persona'].includes(text) ? 'OTHER' : null;
    if (!type) return { responseText: 'Responde 1 para ti o 2 para otra persona.', responseKind: 'INVALID_PATIENT_TYPE', conversationStep: conversation.paso_actual };
    context.new_patient = { flow_type: type };
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME, contexto: context, ...activity });
    return { responseText: type === 'SELF' ? 'Escribe tu nombre completo.' : 'Escribe el nombre completo del nuevo paciente.', responseKind: 'NEW_PATIENT_NAME_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME) {
    const result = validateContactName(message);
    if (!result.valid) return { responseText: 'Escribe un nombre completo válido.', responseKind: 'INVALID_NEW_PATIENT_NAME', conversationStep: conversation.paso_actual };
    data.patient_name = result.value; context.new_patient = data;
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_BIRTH_DATE, contexto: context, ...activity });
    return { responseText: 'Indica la fecha de nacimiento en formato DD/MM/AAAA.', responseKind: 'BIRTH_DATE_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_BIRTH_DATE };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_BIRTH_DATE) {
    const birth = parseBirthDate(message, now);
    if (!birth) return { responseText: 'La fecha no es válida. Escríbela como DD/MM/AAAA.', responseKind: 'INVALID_BIRTH_DATE', conversationStep: conversation.paso_actual };
    Object.assign(data, { birth_date: birth.value, birth_date_display: String(message).trim(), age: birth.age, minor: birth.minor }); context.new_patient = data;
    if (!birth.minor && data.flow_type === 'OTHER') {
      await update({ paso_actual: CONVERSATION_STEPS.REFERRED_RECEPTION, contexto: {}, ...activity });
      return { responseText: 'Para registrar a otra persona adulta necesitamos verificar sus datos y teléfono personal. Recepción continuará el proceso sin crear un registro incorrecto.', responseKind: 'OTHER_ADULT_REFERRED', conversationStep: CONVERSATION_STEPS.REFERRED_RECEPTION };
    }
    if (birth.minor) {
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_GUARDIAN_DATA, contexto: context, ...activity });
      return { responseText: 'El paciente es menor de edad. Escribe el nombre completo del padre, madre o tutor responsable de este número.', responseKind: 'GUARDIAN_DATA_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_GUARDIAN_DATA };
    }
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION, contexto: context, ...activity });
    return { responseText: summary(data), responseKind: 'NEW_PATIENT_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_GUARDIAN_DATA) {
    const result = validateContactName(message);
    if (!result.valid) return { responseText: 'Escribe el nombre completo del responsable.', responseKind: 'INVALID_GUARDIAN_DATA', conversationStep: conversation.paso_actual };
    data.guardian_name = result.value; context.new_patient = data;
    await update({ paso_actual: CONVERSATION_STEPS.WAITING_GUARDIAN_RELATIONSHIP, contexto: context, ...activity });
    return { responseText: `¿Qué relación tiene con el paciente?\n\n${relationText}`, responseKind: 'GUARDIAN_RELATIONSHIP_REQUEST', conversationStep: CONVERSATION_STEPS.WAITING_GUARDIAN_RELATIONSHIP };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_GUARDIAN_RELATIONSHIP) {
    if (data.awaiting_legal) {
      if (!['1','2'].includes(text)) return { responseText: 'Responde 1 para Sí o 2 para No.', responseKind: 'INVALID_LEGAL_GUARDIAN', conversationStep: conversation.paso_actual };
      data.legal_guardian = text === '1'; delete data.awaiting_legal; context.new_patient = data;
      await update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION, contexto: context, ...activity });
      return { responseText: summary(data), responseKind: 'NEW_PATIENT_SUMMARY', conversationStep: CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION };
    }
    const selected = RELATIONSHIPS[Number(text) - 1];
    if (!selected) return { responseText: `Elige una opción válida:\n\n${relationText}`, responseKind: 'INVALID_GUARDIAN_RELATIONSHIP', conversationStep: conversation.paso_actual };
    data.relationship = selected; data.awaiting_legal = true; context.new_patient = data; await update({ contexto: context, ...activity });
    return { responseText: '¿Es responsable legal del menor?\n\n1. Sí\n2. No', responseKind: 'LEGAL_GUARDIAN_REQUEST', conversationStep: conversation.paso_actual };
  }
  if (conversation.paso_actual === CONVERSATION_STEPS.WAITING_NEW_PATIENT_CONFIRMATION) {
    if (text === '3' || text === 'cancelar') { await update({ estado: 'CANCELADA', contexto: {}, ...activity }); return { responseText: 'Alta cancelada. No se creó ningún registro.', responseKind: 'NEW_PATIENT_CANCELLED', conversationStep: conversation.paso_actual }; }
    if (text === '2' || text === 'corregir') { context.new_patient = { flow_type: data.flow_type }; await update({ paso_actual: CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME, contexto: context, ...activity }); return { responseText: 'Escribe nuevamente el nombre completo del paciente.', responseKind: 'NEW_PATIENT_CORRECTION', conversationStep: CONVERSATION_STEPS.WAITING_NEW_PATIENT_NAME }; }
    if (text !== '1' && text !== 'confirmar') return { responseText: summary(data), responseKind: 'INVALID_NEW_PATIENT_CONFIRMATION', conversationStep: conversation.paso_actual };
    const names = splitName(data.patient_name);
    const duplicates = await patientModel.findAll({ where: { nombres: { [Op.iLike]: names.nombres }, apellidos: { [Op.iLike]: names.apellidos }, fecha_nacimiento: data.birth_date, estado: true }, transaction, lock: transaction.LOCK?.UPDATE });
    if (duplicates.length) { await update({ paso_actual: CONVERSATION_STEPS.REFERRED_RECEPTION, contexto: {}, ...activity }); return { responseText: 'Encontramos un paciente con datos compatibles. Recepción verificará la identidad para evitar duplicarlo.', responseKind: 'POSSIBLE_PATIENT_DUPLICATE', conversationStep: CONVERSATION_STEPS.REFERRED_RECEPTION }; }
    const phone = normalizePhoneNumber(conversation.telefono);
    let contact = null;
    if (data.minor) {
      const contacts = await contactModel.findAll({ where: { telefono_normalizado: phone, estado: true }, transaction, lock: transaction.LOCK?.UPDATE });
      if (contacts.length > 1) { await update({ paso_actual: CONVERSATION_STEPS.REFERRED_RECEPTION, contexto: {}, ...activity }); return { responseText: 'Este número corresponde a más de un contacto. Recepción debe verificar quién realiza el registro.', responseKind: 'AMBIGUOUS_GUARDIAN', conversationStep: CONVERSATION_STEPS.REFERRED_RECEPTION }; }
      contact = contacts[0] || null;
      if (!contact) {
        const guardianNames = splitName(data.guardian_name);
        const directTutor = await patientModel.findOne({ where: { telefono_normalizado: phone, estado: true }, transaction, lock: transaction.LOCK?.UPDATE });
        contact = await contactModel.create({ ...guardianNames, telefono: conversation.telefono, telefono_normalizado: phone, paciente_id: directTutor?.id || null, estado: true }, { transaction });
      }
    }
    const patient = await patientModel.create({ ...names, fecha_nacimiento: data.birth_date, edad: data.age, ci: null, sexo: null, telefono: data.minor ? null : conversation.telefono, telefono_normalizado: data.minor ? null : phone, estado: true, registro_pendiente: true }, { transaction });
    if (data.minor) await relationModel.create({ paciente_id: patient.id, contacto_id: contact.id, parentesco: data.relationship, es_contacto_principal: true, es_responsable_legal: Boolean(data.legal_guardian), recibe_recordatorios: true, puede_gestionar_citas: true, autoriza_whatsapp: true, prioridad: 1, estado: true, fecha_fin: null, observaciones: null }, { transaction });
    const patientReference = { id: patient.id, first_name: sanitizeFirstName(patient.nombres) };
    await update({ paciente_id: patient.id, paciente_contexto_id: patient.id, contacto_id: contact?.id || null, contexto_estado: 'SELECCIONADO', contexto_seleccionado_en: now, contexto_origen: 'SELECCION_USUARIO', tipo_contacto: CONTACT_TYPES.EXISTING, paso_actual: CONVERSATION_STEPS.WAITING_REASON, contexto: { patient_reference: patientReference, contact_first_name: patientReference.first_name, appointment_request: { contact_name: data.patient_name } }, ...activity });
    return { responseText: `Registro confirmado para ${data.patient_name}. Ahora describe brevemente el motivo de la cita.`, responseKind: 'NEW_PATIENT_CREATED', conversationStep: CONVERSATION_STEPS.WAITING_REASON, patientId: patient.id };
  }
  return null;
};

module.exports = { steps, parseBirthDate, processNewPatientStep, RELATIONSHIPS };
