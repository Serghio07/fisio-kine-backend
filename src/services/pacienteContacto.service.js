const { Contacto, Paciente, PacienteContacto, ActividadSistema, sequelize } = require('../models');
const { PARENTESCOS_CONTACTO } = require('../models/PacienteContacto');
const { boliviaDate, boliviaDateTime } = require('../utils/boliviaDateTime');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const bool = (value, fallback = false) => value === undefined ? fallback : value === true;
const clean = (value, max) => { if (value === undefined) return undefined; const result = String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); return result || null; };
const relationDto = (item) => { const value = item.get ? item.get({ plain: true }) : item; return { relacion_id: value.id, paciente_id: value.paciente_id, contacto_id: value.contacto_id, contacto: value.contacto ? { id: value.contacto.id, nombres: value.contacto.nombres, apellidos: value.contacto.apellidos, telefono: value.contacto.telefono, estado: value.contacto.estado } : undefined, paciente: value.paciente ? { id: value.paciente.id, nombres: value.paciente.nombres, apellidos: value.paciente.apellidos, estado: value.paciente.estado } : undefined, parentesco: value.parentesco, parentesco_otro: value.parentesco_otro, es_contacto_principal: value.es_contacto_principal, es_responsable_legal: value.es_responsable_legal, recibe_recordatorios: value.recibe_recordatorios, puede_gestionar_citas: value.puede_gestionar_citas, autoriza_whatsapp: value.autoriza_whatsapp, prioridad: value.prioridad, estado: value.estado, fecha_inicio: value.fecha_inicio, fecha_fin: value.fecha_fin, observaciones: value.observaciones, created_at: value.created_at, updated_at: value.updated_at }; };
const normalize = (body, current = {}) => {
  const output = {};
  if (Object.hasOwn(body, 'parentesco')) output.parentesco = String(body.parentesco || '').trim().toLocaleUpperCase('es-BO');
  const relationship = output.parentesco || current.parentesco;
  if (Object.hasOwn(body, 'parentesco_otro') || output.parentesco) output.parentesco_otro = relationship === 'OTRO' ? clean(body.parentesco_otro, 100)?.toLocaleUpperCase('es-BO') || null : null;
  for (const key of ['es_contacto_principal', 'es_responsable_legal', 'recibe_recordatorios', 'puede_gestionar_citas', 'autoriza_whatsapp']) if (Object.hasOwn(body, key)) output[key] = bool(body[key]);
  if (Object.hasOwn(body, 'prioridad')) output.prioridad = Number(body.prioridad);
  if (Object.hasOwn(body, 'observaciones')) output.observaciones = clean(body.observaciones, 2000);
  if (Object.hasOwn(body, 'fecha_inicio')) output.fecha_inicio = body.fecha_inicio || boliviaDate();
  const value = { ...current, ...output };
  if (!PARENTESCOS_CONTACTO.includes(value.parentesco)) throw fail('El parentesco no es válido.');
  if (value.parentesco === 'OTRO' && !value.parentesco_otro) throw fail('Debe especificar el parentesco cuando selecciona OTRO.');
  if (!Number.isInteger(Number(value.prioridad)) || Number(value.prioridad) <= 0) throw fail('La prioridad debe ser un entero mayor que cero.');
  output.prioridad = Number(value.prioridad); return output;
};
const audit = async ({ userId, action, relation, changes = {}, transaction }) => { const stamp = boliviaDateTime(); await ActividadSistema.create({ usuario_id: userId, paciente_id: relation.paciente_id, entidad_id: relation.id, fecha: stamp.fecha, hora: stamp.hora, modulo: 'Contactos', accion: action, detalle: `${action}: relación ${relation.id}`, datos: { contacto_id: relation.contacto_id, relacion_id: relation.id, cambios: changes }, metodo: 'PATCH', ruta: `/api/pacientes/${relation.paciente_id}/contactos/${relation.id}` }, { transaction }); };
const auditSensitiveChanges = async ({ userId, relation, before = {}, after = {}, transaction }) => {
  const events = [];
  if (before.es_contacto_principal !== after.es_contacto_principal) events.push('CONTACTO_PRINCIPAL_CAMBIADO');
  if (before.es_responsable_legal !== after.es_responsable_legal) events.push('RESPONSABILIDAD_LEGAL_CAMBIADA');
  if (['recibe_recordatorios', 'puede_gestionar_citas', 'autoriza_whatsapp'].some((key) => before[key] !== after[key])) events.push('PERMISOS_CONTACTO_CAMBIADOS');
  for (const action of events) await audit({ userId, action, relation, changes: { antes: before, despues: after }, transaction });
};
const ensureEntities = async (patientId, contactId, transaction) => { const [patient, contact] = await Promise.all([Paciente.findByPk(patientId, { attributes: ['id'], transaction }), Contacto.findByPk(contactId, { transaction })]); if (!patient) throw fail('Paciente no encontrado.', 404); if (!contact) throw fail('Contacto no encontrado.', 404); if (!contact.estado) throw fail('No se puede vincular un contacto inactivo.', 409); return contact; };
const clearPrincipal = async (patientId, exceptId, transaction) => PacienteContacto.update({ es_contacto_principal: false }, { where: { paciente_id: patientId, estado: true, fecha_fin: null, es_contacto_principal: true, ...(exceptId ? { id: { [require('sequelize').Op.ne]: exceptId } } : {}) }, transaction });
const ensureMinorStillReachable = async (patientId, transaction) => {
  const patient = await Paciente.findByPk(patientId, { attributes: ['id', 'fecha_nacimiento', 'telefono'], transaction });
  const { isMinorByBirthDate, resolveAdministrativePhone } = require('./patientAdministrativeContact.service');
  if (patient && isMinorByBirthDate(patient.fecha_nacimiento) && !(await resolveAdministrativePhone(patient, { transaction }))) {
    throw fail('El paciente menor debe conservar un responsable principal con teléfono.', 409);
  }
};
const create = async ({ patientId, contactId, body, userId, transaction: externalTransaction }) => {
  const run = async (transaction) => {
    await ensureEntities(patientId, contactId, transaction);
    if (await PacienteContacto.findOne({ where: { paciente_id: patientId, contacto_id: contactId, estado: true, fecha_fin: null }, transaction })) throw fail('Ya existe una relación activa entre el paciente y el contacto.', 409);
    const payload = normalize({ prioridad: 1, ...body }, {}); if (payload.es_contacto_principal) await clearPrincipal(patientId, null, transaction);
    try { const item = await PacienteContacto.create({ ...payload, paciente_id: patientId, contacto_id: contactId, estado: true, fecha_fin: null, fecha_inicio: payload.fecha_inicio || boliviaDate() }, { transaction }); await audit({ userId, action: 'CONTACTO_VINCULADO_PACIENTE', relation: item, changes: payload, transaction }); await auditSensitiveChanges({ userId, relation: item, before: {}, after: item.get({ plain: true }), transaction }); return item; }
    catch (error) { if (error.name === 'SequelizeUniqueConstraintError') throw fail('Conflicto al crear la relación o asignar el contacto principal.', 409); throw error; }
  }; return externalTransaction ? run(externalTransaction) : sequelize.transaction(run);
};
const update = async ({ patientId, relationId, body, userId }) => sequelize.transaction(async (transaction) => {
  const item = await PacienteContacto.findOne({ where: { id: relationId, paciente_id: patientId }, transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Relación de contacto no encontrada.', 404); if (!item.estado || item.fecha_fin) throw fail('Una relación histórica cerrada no puede modificarse.', 409);
  if (Object.hasOwn(body, 'paciente_id') || Object.hasOwn(body, 'contacto_id')) throw fail('El paciente y el contacto de una relación no pueden modificarse.', 409);
  const before = item.get({ plain: true }), payload = normalize(body, before); if (payload.es_contacto_principal) await clearPrincipal(patientId, item.id, transaction);
  try { await item.update(payload, { transaction }); await ensureMinorStillReachable(patientId, transaction); const after = item.get({ plain: true }); await audit({ userId, action: 'CONTACTO_RELACION_MODIFICADA', relation: item, changes: { antes: before, despues: payload }, transaction }); await auditSensitiveChanges({ userId, relation: item, before, after, transaction }); return item; }
  catch (error) { if (error.name === 'SequelizeUniqueConstraintError') throw fail('Conflicto al cambiar el contacto principal.', 409); throw error; }
});
const close = async ({ patientId, relationId, userId }) => sequelize.transaction(async (transaction) => { const item = await PacienteContacto.findOne({ where: { id: relationId, paciente_id: patientId }, transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw fail('Relación de contacto no encontrada.', 404); if (!item.estado && item.fecha_fin) return item; await item.update({ estado: false, fecha_fin: boliviaDate(), es_contacto_principal: false }, { transaction }); await ensureMinorStillReachable(patientId, transaction); await audit({ userId, action: 'CONTACTO_RELACION_CERRADA', relation: item, transaction }); return item; });
const listByPatient = async (patientId, includeHistory = false) => { if (!(await Paciente.findByPk(patientId, { attributes: ['id'] }))) throw fail('Paciente no encontrado.', 404); const rows = await PacienteContacto.findAll({ where: { paciente_id: patientId, ...(!includeHistory ? { estado: true, fecha_fin: null } : {}) }, include: [{ model: Contacto, as: 'contacto', attributes: ['id', 'nombres', 'apellidos', 'telefono', 'estado'] }], order: [['estado', 'DESC'], ['es_contacto_principal', 'DESC'], ['prioridad', 'ASC'], ['id', 'ASC']] }); return rows.map(relationDto); };
const listByContact = async (contactId, includeHistory = false) => { if (!(await Contacto.findByPk(contactId, { attributes: ['id'] }))) throw fail('Contacto no encontrado.', 404); const rows = await PacienteContacto.findAll({ where: { contacto_id: contactId, ...(!includeHistory ? { estado: true, fecha_fin: null } : {}) }, include: [{ model: Paciente, as: 'paciente', attributes: ['id', 'nombres', 'apellidos', 'estado'] }], order: [['estado', 'DESC'], ['prioridad', 'ASC'], ['id', 'ASC']] }); return rows.map(relationDto); };
const createContactAndRelation = async ({ patientId, contactBody, relationBody, userId }) => sequelize.transaction(async (transaction) => { if (!(await Paciente.findByPk(patientId, { attributes: ['id'], transaction }))) throw fail('Paciente no encontrado.', 404); const contact = await require('./contacto.service').create({ body: contactBody, userId, transaction }); const relation = await create({ patientId, contactId: contact.id, body: relationBody, userId, transaction }); return { contact, relation }; });
module.exports = { relationDto, normalize, audit, auditSensitiveChanges, ensureEntities, clearPrincipal, ensureMinorStillReachable, create, update, close, listByPatient, listByContact, createContactAndRelation };
