const { Paciente } = require('../models');
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
    attributes: ['id', 'nombres', 'estado'],
    where: { telefono_normalizado: candidates[0] },
    order: [['id', 'ASC']],
    limit: 3,
    raw: true
  });
};

const identifyWhatsappContact = async (phone, options = {}) => {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    return { type: CONTACT_TYPES.INVALID_PHONE, found: false, patient: null };
  }

  const matches = await findPatientsByWhatsappPhone(
    normalizedPhone,
    options.patientModel || Paciente
  );

  if (matches.length === 0) {
    return { type: CONTACT_TYPES.NEW, found: false, patient: null };
  }

  if (matches.length > 1) {
    return { type: CONTACT_TYPES.INTEGRITY_ERROR, found: false, patient: null };
  }

  const match = matches[0];
  const firstName = sanitizeFirstName(match.nombres);
  return {
    type: CONTACT_TYPES.EXISTING,
    found: true,
    patient: {
      id: match.id,
      firstName,
      displayName: firstName
    }
  };
};

module.exports = {
  CONTACT_TYPES,
  normalizePhoneNumber,
  buildPhoneCandidates,
  sanitizeFirstName,
  findPatientsByWhatsappPhone,
  identifyWhatsappContact
};
