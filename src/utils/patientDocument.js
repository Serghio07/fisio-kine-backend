const DOCUMENT_TYPES = ['CI', 'DNI', 'PASAPORTE', 'CEDULA', 'CARNET_EXTRANJERIA', 'OTRO'];
const DOCUMENT_NUMBER_PATTERN = /^[\p{L}\d][\p{L}\d\-/. ]*[\p{L}\d]$|^[\p{L}\d]$/u;

const cleanDocumentText = (value) => {
  if (value === null || value === undefined) return null;
  const clean = String(value).trim().replace(/\s+/g, ' ');
  return clean || null;
};

const normalizePatientDocument = (value) => {
  const clean = cleanDocumentText(value);
  return clean ? clean.toLocaleUpperCase('es-BO') : null;
};

const normalizeDocumentType = (value) => {
  const clean = normalizePatientDocument(value);
  return DOCUMENT_TYPES.includes(clean) ? clean : null;
};

const patientDocumentLabel = (patient = {}) => {
  const number = cleanDocumentText(patient.numero_documento) || cleanDocumentText(patient.ci);
  if (!number) return '';
  const type = normalizeDocumentType(patient.tipo_documento) || 'CI';
  const label = type === 'OTRO'
    ? normalizePatientDocument(patient.nombre_documento_otro) || 'OTRO'
    : type;
  return `${label} ${number}`;
};

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_NUMBER_PATTERN,
  cleanDocumentText,
  normalizePatientDocument,
  normalizeDocumentType,
  patientDocumentLabel
};
