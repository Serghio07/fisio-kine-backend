const { Paciente, Contacto, PacienteContacto } = require('../models');
const { normalizePhoneNumber } = require('../utils/phone');

const CONTACT_TYPES = {
  EXISTING: 'PACIENTE_EXISTENTE',
  NEW: 'CONTACTO_NUEVO',
  INTEGRITY_ERROR: 'ERROR_INTEGRIDAD_TELEFONO',
  INVALID_PHONE: 'TELEFONO_INVALIDO'
};

const buildPhoneCandidates = (phone) => {
  const normalized = normalizePhoneNumber(phone);
  return normalized ? [normalized] : [];
};

const sanitizeFirstName = (value) => {
  if (typeof value !== 'string') return '';
  const firstPart = value.trim().split(/\s+/)[0] || '';
  return firstPart.replace(/[^\p{L}'-]/gu, '').slice(0, 50);
};

const findPatientsByWhatsappPhone = async (phone, patientModel = Paciente) => {
  const candidates = buildPhoneCandidates(phone);
  if (candidates.length === 0) return [];

  return patientModel.findAll({
    attributes: ['id', 'nombres', 'apellidos', 'estado'],
    where: { telefono_normalizado: candidates[0], estado: true },
    order: [['id', 'ASC']],
    limit: 3,
    raw: true
  });
};

const resolveWhatsappIdentityByPhone = async (phone, options = {}) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return { type: CONTACT_TYPES.INVALID_PHONE, phone: null, contacts: [], patientOptions: [] };
  const patientModel = options.patientModel || Paciente;
  const contactModel = options.contactModel || (options.patientModel ? { findAll: async () => [] } : Contacto);
  const relationModel = options.relationModel || (options.patientModel ? { findAll: async () => [] } : PacienteContacto);
  const direct = await patientModel.findAll({ attributes: ['id','nombres','apellidos','estado'], where: { telefono_normalizado: normalizedPhone, estado: true }, order: [['id','ASC']], raw: true });
  const contacts = await contactModel.findAll({ attributes: ['id','nombres','apellidos','estado'], where: { telefono_normalizado: normalizedPhone, estado: true }, order: [['id','ASC']], raw: true });
  const contactIds = contacts.map((item) => item.id);
  const relations = contactIds.length ? await relationModel.findAll({
    where: { contacto_id: contactIds, estado: true, fecha_fin: null, autoriza_whatsapp: true, puede_gestionar_citas: true },
    include: [{ model: patientModel, as: 'paciente', required: true, where: { estado: true }, attributes: ['id','nombres','apellidos','estado'] }],
    order: [['es_contacto_principal','DESC'],['prioridad','ASC'],['id','ASC']]
  }) : [];
  const byPatient = new Map();
  direct.forEach((patient) => byPatient.set(String(patient.id), { patientId: patient.id, displayName: `${patient.nombres || ''} ${patient.apellidos || ''}`.trim(), firstName: sanitizeFirstName(patient.nombres), source: 'PACIENTE', contactId: null, relationship: 'YO', permissions: { manageAppointments: true, whatsapp: true } }));
  relations.forEach((relation) => {
    const patient = relation.paciente?.get ? relation.paciente.get({ plain: true }) : relation.paciente;
    if (!patient || byPatient.has(String(patient.id))) return;
    byPatient.set(String(patient.id), { patientId: patient.id, displayName: `${patient.nombres || ''} ${patient.apellidos || ''}`.trim(), firstName: sanitizeFirstName(patient.nombres), source: 'CONTACTO', contactId: relation.contacto_id, relationship: relation.parentesco, permissions: { manageAppointments: true, whatsapp: true } });
  });
  const patientOptions = [...byPatient.values()];
  return { type: patientOptions.length ? CONTACT_TYPES.EXISTING : CONTACT_TYPES.NEW, phone: normalizedPhone, contacts, contactId: contacts.length === 1 ? contacts[0].id : null, patientOptions };
};

const identifyWhatsappContact = async (phone, options = {}) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { type: CONTACT_TYPES.INVALID_PHONE, found: false, patient: null };
  }

  const identity = await (options.resolver || resolveWhatsappIdentityByPhone)(normalizedPhone, options);
  const matches = identity.patientOptions || [];

  if (matches.length === 0) {
    return { type: CONTACT_TYPES.NEW, found: false, patient: null };
  }

  const match = matches[0];
  const firstName = match.firstName || sanitizeFirstName(match.nombres);
  return {
    type: CONTACT_TYPES.EXISTING,
    found: true,
    contactId: identity.contactId || null,
    options: matches.map((item) => ({
      ...item,
      // El telefono puede pertenecer a varias personas. Solo atribuimos al
      // emisor cuando la identidad del contacto es inequivoca.
      contactId: identity.contactId ? item.contactId : null
    })),
    requiresSelection: matches.length > 1,
    patient: matches.length === 1 ? {
      id: match.patientId || match.id,
      firstName,
      displayName: match.displayName || firstName,
      source: match.source,
      contactId: identity.contactId ? (match.contactId || identity.contactId) : null
    } : null
  };
};

module.exports = {
  CONTACT_TYPES,
  normalizePhoneNumber,
  buildPhoneCandidates,
  sanitizeFirstName,
  findPatientsByWhatsappPhone,
  resolveWhatsappIdentityByPhone,
  identifyWhatsappContact
};
