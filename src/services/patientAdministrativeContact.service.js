const { Op } = require('sequelize');
const { Contacto, Paciente, PacienteContacto } = require('../models');
const { normalizePhoneNumber } = require('../utils/phone');
const { boliviaDate } = require('../utils/boliviaDateTime');

const isMinorByBirthDate = (birthDate, today = boliviaDate()) => {
  if (!birthDate) return false;
  const [year, month, day] = String(birthDate).slice(0, 10).split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = String(today).split('-').map(Number);
  if (![year, month, day, currentYear, currentMonth, currentDay].every(Number.isInteger)) return false;
  let age = currentYear - year;
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 0 && age < 18;
};

const principalRelation = async (patientId, transaction) => PacienteContacto.findOne({
  where: { paciente_id: patientId, estado: true, fecha_fin: null, es_contacto_principal: true },
  include: [{
    model: Contacto,
    as: 'contacto',
    required: true,
    where: { estado: true },
    attributes: ['id', 'nombres', 'apellidos', 'telefono', 'telefono_normalizado', 'tipo_documento', 'numero_documento', 'nombre_documento_otro', 'paciente_id', 'estado']
  }],
  order: [['prioridad', 'ASC'], ['id', 'ASC']],
  transaction
});

const resolveAdministrativePhone = async (patientOrId, { transaction } = {}) => {
  const patient = typeof patientOrId === 'object' && patientOrId
    ? patientOrId
    : await Paciente.findByPk(patientOrId, { transaction });
  if (!patient) return null;
  const plain = patient.get ? patient.get({ plain: true }) : patient;
  if (!isMinorByBirthDate(plain.fecha_nacimiento)) {
    const normalized = normalizePhoneNumber(plain.telefono);
    return normalized ? { telefono: plain.telefono, telefono_normalizado: normalized, fuente: 'PACIENTE', contacto_id: null, responsable_principal: null } : null;
  }
  const relation = await principalRelation(plain.id, transaction);
  if (!relation?.contacto) return null;
  const contact = relation.contacto.get ? relation.contacto.get({ plain: true }) : relation.contacto;
  const normalized = normalizePhoneNumber(contact.telefono);
  if (!normalized) return null;
  return {
    telefono: contact.telefono,
    telefono_normalizado: normalized,
    fuente: 'CONTACTO',
    contacto_id: contact.id,
    nombre_contacto: `${contact.nombres || ''} ${contact.apellidos || ''}`.trim(),
    parentesco: relation.parentesco,
    es_responsable_legal: relation.es_responsable_legal,
    es_contacto_principal: relation.es_contacto_principal,
    responsable_principal: {
      id: contact.id,
      nombres: contact.nombres,
      apellidos: contact.apellidos,
      parentesco: relation.parentesco,
      parentesco_otro: relation.parentesco_otro,
      tipo_documento: contact.tipo_documento || null,
      numero_documento: contact.numero_documento || null,
      nombre_documento_otro: contact.nombre_documento_otro || null,
      paciente_id: contact.paciente_id || null
    }
  };
};

const recipientFailure = (patientId, reason, source = 'PACIENTE') => ({
  patientId, contactId: null, phone: null, normalizedPhone: null,
  source, relationship: null, recipientName: null, reason
});

const resolveReminderRecipient = async (patientOrId, { transaction, patientModel = Paciente, relationModel = PacienteContacto, contactModel = Contacto } = {}) => {
  const patient = typeof patientOrId === 'object' && patientOrId
    ? patientOrId
    : await patientModel.findByPk(patientOrId, { transaction });
  if (!patient) return recipientFailure(typeof patientOrId === 'object' ? patientOrId?.id : patientOrId, 'PACIENTE_NO_ENCONTRADO');
  const plain = patient.get ? patient.get({ plain: true }) : patient;
  const patientName = `${plain.nombres || ''} ${plain.apellidos || ''}`.trim();
  if (!isMinorByBirthDate(plain.fecha_nacimiento)) {
    const normalized = normalizePhoneNumber(plain.telefono_normalizado || plain.telefono);
    return normalized ? {
      patientId: plain.id, contactId: null, phone: plain.telefono || normalized,
      normalizedPhone: normalized, source: 'PACIENTE', relationship: null,
      recipientName: patientName, reason: null
    } : recipientFailure(plain.id, 'TELEFONO_PACIENTE_INVALIDO');
  }

  const relation = await relationModel.findOne({
    where: { paciente_id: plain.id, estado: true, fecha_fin: null, es_contacto_principal: true },
    include: [{ model: contactModel, as: 'contacto', required: false }],
    order: [['prioridad', 'ASC'], ['id', 'ASC']], transaction
  });
  if (!relation) return recipientFailure(plain.id, 'SIN_CONTACTO_PRINCIPAL', 'CONTACTO');
  if (!relation.recibe_recordatorios) return recipientFailure(plain.id, 'RECORDATORIOS_NO_AUTORIZADOS', 'CONTACTO');
  if (!relation.autoriza_whatsapp) return recipientFailure(plain.id, 'WHATSAPP_NO_AUTORIZADO', 'CONTACTO');
  const contact = relation.contacto?.get ? relation.contacto.get({ plain: true }) : relation.contacto;
  if (!contact || contact.estado !== true) return recipientFailure(plain.id, 'CONTACTO_INACTIVO', 'CONTACTO');
  const normalized = normalizePhoneNumber(contact.telefono_normalizado || contact.telefono);
  if (!normalized) return recipientFailure(plain.id, 'TELEFONO_CONTACTO_INVALIDO', 'CONTACTO');
  return {
    patientId: plain.id, contactId: contact.id, phone: contact.telefono || normalized,
    normalizedPhone: normalized, source: 'CONTACTO', relationship: relation.parentesco,
    recipientName: `${contact.nombres || ''} ${contact.apellidos || ''}`.trim(), reason: null
  };
};

const patientDtoWithAdministrativePhone = async (patient, options) => {
  const value = patient.get ? patient.get({ plain: true }) : { ...patient };
  delete value.telefono_normalizado;
  delete value.numero_documento_normalizado;
  const administrative = await resolveAdministrativePhone(patient, options);
  return {
    ...value,
    telefono_personal: value.telefono || null,
    telefono_administrativo: administrative?.telefono || null,
    telefono_administrativo_normalizado: administrative?.telefono_normalizado || null,
    telefono_fuente: administrative?.fuente || null,
    responsable_principal: administrative?.responsable_principal || null
  };
};

const patientDtosWithAdministrativePhone = async (patients = [], { transaction } = {}) => {
  const values = patients.map((patient) => (patient?.get ? patient.get({ plain: true }) : { ...patient }));
  const minorIds = [...new Set(values
    .filter((patient) => patient?.id && isMinorByBirthDate(patient.fecha_nacimiento))
    .map((patient) => patient.id))];
  const relations = minorIds.length ? await PacienteContacto.findAll({
    where: {
      paciente_id: { [Op.in]: minorIds },
      estado: true,
      fecha_fin: null,
      es_contacto_principal: true
    },
    include: [{
      model: Contacto,
      as: 'contacto',
      required: true,
      where: { estado: true },
      attributes: ['id', 'nombres', 'apellidos', 'telefono', 'telefono_normalizado', 'tipo_documento', 'numero_documento', 'nombre_documento_otro', 'paciente_id', 'estado']
    }],
    order: [['prioridad', 'ASC'], ['id', 'ASC']],
    transaction
  }) : [];
  const principalByPatient = new Map();
  relations.forEach((relation) => {
    if (!principalByPatient.has(String(relation.paciente_id))) principalByPatient.set(String(relation.paciente_id), relation);
  });

  return values.map((patient) => {
    delete patient.telefono_normalizado;
    delete patient.numero_documento_normalizado;
    let administrative = null;
    if (!isMinorByBirthDate(patient.fecha_nacimiento)) {
      const normalized = normalizePhoneNumber(patient.telefono);
      if (normalized) administrative = { telefono: patient.telefono, telefono_normalizado: normalized, fuente: 'PACIENTE' };
    } else {
      const relation = principalByPatient.get(String(patient.id));
      const contact = relation?.contacto?.get ? relation.contacto.get({ plain: true }) : relation?.contacto;
      const normalized = normalizePhoneNumber(contact?.telefono);
      if (contact && normalized) administrative = {
        telefono: contact.telefono,
        telefono_normalizado: normalized,
        fuente: 'CONTACTO',
        responsable_principal: {
          id: contact.id,
          nombres: contact.nombres,
          apellidos: contact.apellidos,
          parentesco: relation.parentesco,
          parentesco_otro: relation.parentesco_otro,
          tipo_documento: contact.tipo_documento || null,
          numero_documento: contact.numero_documento || null,
          nombre_documento_otro: contact.nombre_documento_otro || null,
          paciente_id: contact.paciente_id || null
        }
      };
    }
    return {
      ...patient,
      telefono_personal: patient.telefono || null,
      telefono_administrativo: administrative?.telefono || null,
      telefono_administrativo_normalizado: administrative?.telefono_normalizado || null,
      telefono_fuente: administrative?.fuente || null,
      responsable_principal: administrative?.responsable_principal || null
    };
  });
};

const enrichRecordsWithAdministrativePhone = async (records = [], association = 'paciente', options) => {
  const list = Array.isArray(records) ? records : [records];
  const plain = list.map((record) => (record?.get ? record.get({ plain: true }) : { ...record }));
  const patients = plain.map((record) => record?.[association]).filter(Boolean);
  const enriched = await patientDtosWithAdministrativePhone(patients, options);
  const byId = new Map(enriched.map((patient) => [String(patient.id), patient]));
  const output = plain.map((record) => ({
    ...record,
    [association]: record?.[association]?.id
      ? byId.get(String(record[association].id)) || record[association]
      : record?.[association]
  }));
  return Array.isArray(records) ? output : output[0];
};

module.exports = {
  isMinorByBirthDate,
  principalRelation,
  resolveAdministrativePhone,
  resolveReminderRecipient,
  patientDtoWithAdministrativePhone,
  patientDtosWithAdministrativePhone,
  enrichRecordsWithAdministrativePhone
};
