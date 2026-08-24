const { Op } = require('sequelize');
const { Contacto, Paciente, PacienteContacto, ActividadSistema, sequelize } = require('../models');
const { normalizePhoneNumber } = require('../utils/phone');
const { DOCUMENT_TYPES, DOCUMENT_NUMBER_PATTERN, cleanDocumentText, normalizePatientDocument, normalizeDocumentType, patientDocumentLabel } = require('../utils/patientDocument');
const { boliviaDateTime } = require('../utils/boliviaDateTime');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, max, upper = false) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const clean = String(value).trim().replace(/\s+/g, ' ').slice(0, max);
  if (!clean) return null;
  return upper ? clean.toLocaleUpperCase('es-BO') : clean;
};
const patientSummary = (patient) => patient ? ({ id: patient.id, nombres: patient.nombres, apellidos: patient.apellidos, documento: patientDocumentLabel(patient) || null, estado: patient.estado }) : null;
const contactDto = (item, detail = false) => {
  const value = item.get ? item.get({ plain: true }) : item;
  return {
    id: value.id, nombres: value.nombres, apellidos: value.apellidos, telefono: value.telefono,
    tipo_documento: value.tipo_documento, numero_documento: value.numero_documento,
    nombre_documento_otro: value.nombre_documento_otro, paciente_id: value.paciente_id,
    estado: value.estado, created_at: value.created_at, updated_at: value.updated_at,
    paciente_vinculado: patientSummary(value.paciente_vinculado),
    ...(detail && value.pacientes_relacionados ? { relaciones: value.pacientes_relacionados.map(require('./pacienteContacto.service').relationDto) } : {})
  };
};
const normalizeDocument = (body, output, current = {}) => {
  const supplied = ['tipo_documento', 'numero_documento', 'nombre_documento_otro'].some((key) => Object.hasOwn(body, key));
  if (!supplied) return;
  const type = normalizeDocumentType(Object.hasOwn(body, 'tipo_documento') ? body.tipo_documento : current.tipo_documento);
  const number = cleanDocumentText(Object.hasOwn(body, 'numero_documento') ? body.numero_documento : current.numero_documento);
  const other = type === 'OTRO' ? text(Object.hasOwn(body, 'nombre_documento_otro') ? body.nombre_documento_otro : current.nombre_documento_otro, 100, true) : null;
  if (!type && !number && !other) Object.assign(output, { tipo_documento: null, numero_documento: null, numero_documento_normalizado: null, nombre_documento_otro: null });
  else {
    if (!type || !DOCUMENT_TYPES.includes(type)) throw fail('El tipo de documento no es válido.');
    if (!number || number.length > 50 || !DOCUMENT_NUMBER_PATTERN.test(number)) throw fail('El número de documento no es válido.');
    if (type === 'CI' && !/^\d+$/.test(number)) throw fail('El CI solo puede contener números.');
    if (type === 'OTRO' && !other) throw fail('El nombre del documento es obligatorio cuando el tipo es OTRO.');
    Object.assign(output, { tipo_documento: type, numero_documento: number, numero_documento_normalizado: normalizePatientDocument(number), nombre_documento_otro: other });
  }
};
const normalizePayload = (body, { create = false, current = {} } = {}) => {
  const output = {};
  if (create || Object.hasOwn(body, 'nombres')) output.nombres = text(body.nombres, 150, true);
  if (create || Object.hasOwn(body, 'apellidos')) output.apellidos = text(body.apellidos, 150, true);
  if (create || Object.hasOwn(body, 'telefono')) {
    output.telefono = text(body.telefono, 30);
    output.telefono_normalizado = normalizePhoneNumber(output.telefono);
  }
  if (Object.hasOwn(body, 'estado')) output.estado = body.estado === true;
  normalizeDocument(body, output, current);
  return output;
};
const validate = (payload, current = {}) => {
  const value = { ...current, ...payload };
  if (!value.nombres) throw fail('Los nombres son obligatorios.');
  if (!value.apellidos) throw fail('Los apellidos son obligatorios.');
  if (!value.telefono || !value.telefono_normalizado) throw fail('El número de teléfono no es válido.');
};
const audit = async ({ userId, action, contact, patientId = null, relationId = null, changes = {}, transaction, method = 'POST' }) => {
  const stamp = boliviaDateTime();
  await ActividadSistema.create({ usuario_id: userId, paciente_id: patientId, entidad_id: relationId || contact.id, fecha: stamp.fecha, hora: stamp.hora, modulo: 'Contactos', accion: action, detalle: `${action}: contacto ${contact.id}`, datos: { contacto_id: contact.id, relacion_id: relationId, cambios: changes }, metodo: method, ruta: `/api/contactos/${contact.id}` }, { transaction });
};
const ensureLinkedPatient = async (patientId, contactId = null, transaction) => {
  if (patientId === undefined || patientId === null || patientId === '') return null;
  const id = Number(patientId); if (!Number.isInteger(id) || id <= 0) throw fail('El paciente vinculado no es válido.');
  if (!(await Paciente.findByPk(id, { attributes: ['id'], transaction }))) throw fail('Paciente vinculado no encontrado.', 404);
  const existing = await Contacto.findOne({ where: { paciente_id: id, ...(contactId ? { id: { [Op.ne]: contactId } } : {}) }, attributes: ['id'], transaction });
  if (existing) throw fail('El paciente ya está vinculado a otro contacto.', 409);
  return id;
};
const create = async ({ body, userId, transaction: externalTransaction }) => {
  const run = async (transaction) => {
    const payload = normalizePayload(body, { create: true }); validate(payload);
    payload.paciente_id = await ensureLinkedPatient(body.paciente_id, null, transaction);
    try { const item = await Contacto.create(payload, { transaction }); await audit({ userId, action: 'CONTACTO_CREADO', contact: item, changes: payload, transaction }); return item; }
    catch (error) { if (error.name === 'SequelizeUniqueConstraintError') throw fail('El paciente ya está vinculado a otro contacto.', 409); throw error; }
  };
  return externalTransaction ? run(externalTransaction) : sequelize.transaction(run);
};
const update = async ({ id, body, userId }) => sequelize.transaction(async (transaction) => {
  const item = await Contacto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Contacto no encontrado.', 404);
  if (Object.hasOwn(body, 'estado')) throw fail('El estado del contacto debe modificarse mediante la operación específica.', 409);
  if (Object.hasOwn(body, 'paciente_id') && Number(body.paciente_id || 0) !== Number(item.paciente_id || 0)) throw fail('El paciente vinculado no puede cambiarse mediante esta operación.', 409);
  const before = item.get({ plain: true }), payload = normalizePayload(body, { current: before }); validate(payload, before); await item.update(payload, { transaction });
  await audit({ userId, action: 'CONTACTO_MODIFICADO', contact: item, changes: { antes: before, despues: payload }, transaction, method: 'PATCH' }); return item;
});
const deactivate = async ({ id, userId }) => sequelize.transaction(async (transaction) => {
  const item = await Contacto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Contacto no encontrado.', 404);
  if (!item.estado) return item;
  if (await PacienteContacto.count({ where: { contacto_id: item.id, estado: true, fecha_fin: null }, transaction })) throw fail('No se puede desactivar un contacto mientras tenga relaciones activas.', 409);
  await item.update({ estado: false }, { transaction }); await audit({ userId, action: 'CONTACTO_DESACTIVADO', contact: item, transaction, method: 'PATCH' }); return item;
});
const activate = async ({ id, userId }) => sequelize.transaction(async (transaction) => {
  const item = await Contacto.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Contacto no encontrado.', 404);
  if (item.estado) return item;
  await item.update({ estado: true }, { transaction }); await audit({ userId, action: 'CONTACTO_REACTIVADO', contact: item, transaction, method: 'PATCH' }); return item;
});
const list = async (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1), limit = Math.min(100, Math.max(5, Number.parseInt(query.limit, 10) || 20));
  const where = {}; if (query.estado === 'activo') where.estado = true; if (query.estado === 'inactivo') where.estado = false;
  const raw = String(query.buscar || query.search || '').trim().slice(0, 100).replace(/[%_]/g, '');
  if (raw) { const phone = normalizePhoneNumber(raw); const document = normalizePatientDocument(raw); where[Op.or] = [{ nombres: { [Op.iLike]: `%${raw}%` } }, { apellidos: { [Op.iLike]: `%${raw}%` } }, { telefono: { [Op.iLike]: `%${raw}%` } }, ...(phone ? [{ telefono_normalizado: { [Op.iLike]: `%${phone}%` } }] : []), { numero_documento: { [Op.iLike]: `%${raw}%` } }, ...(document ? [{ numero_documento_normalizado: { [Op.iLike]: `%${document}%` } }] : [])]; }
  const result = await Contacto.findAndCountAll({ where, include: [{ model: Paciente, as: 'paciente_vinculado', attributes: ['id', 'nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'ci', 'estado'], required: false }], distinct: true, limit, offset: (page - 1) * limit, order: [['nombres', 'ASC'], ['apellidos', 'ASC'], ['id', 'ASC']] });
  return { data: result.rows.map((item) => contactDto(item)), pagination: { page, limit, total: result.count, totalPages: Math.ceil(result.count / limit) } };
};
const get = async (id) => { const item = await Contacto.findByPk(id, { include: [{ model: Paciente, as: 'paciente_vinculado', attributes: ['id', 'nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'ci', 'estado'], required: false }, { model: PacienteContacto, as: 'pacientes_relacionados', include: [{ model: Paciente, as: 'paciente', attributes: ['id', 'nombres', 'apellidos', 'estado'] }] }] }); return item ? contactDto(item, true) : null; };

module.exports = { fail, contactDto, normalizePayload, validate, ensureLinkedPatient, audit, create, update, deactivate, activate, list, get };
