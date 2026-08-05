const { Op } = require('sequelize');
const { WhatsappReceptionReferral, WhatsappSolicitudCita, Paciente, Usuario, Cita, ActividadSistema } = require('../models');
const { REFERRAL_TYPES, REFERRAL_STATES, REFERRAL_PRIORITIES } = require('../models/WhatsappReceptionReferral');
const { boliviaDateTime } = require('../utils/boliviaDateTime');

const priorityOrder = `CASE prioridad WHEN 'URGENTE' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END`;
const maskPhone = (phone) => { const value = String(phone || ''); return value.length > 6 ? `${value.slice(0, 3)}${'*'.repeat(value.length - 6)}${value.slice(-3)}` : '*'.repeat(value.length); };
const includes = [
  { model: Paciente, as: 'paciente', attributes: ['nombres'], required: false },
  { model: Usuario, as: 'responsable', attributes: ['nombre'], required: false },
  { model: Cita, as: 'cita', attributes: ['fecha', 'hora_inicio', 'hora_fin'], required: false }
  , { model: WhatsappSolicitudCita, as: 'solicitud', attributes: ['nombre_whatsapp', 'motivo', 'fecha_solicitada', 'hora_inicio', 'hora_fin', 'estado'], required: false }
];
const dto = (item, detail = false) => ({
  id: Number(item.id), tipo: item.tipo_derivacion, estado: item.estado, prioridad: item.prioridad,
  contacto: item.paciente?.nombres?.trim() || item.solicitud?.nombre_whatsapp?.trim() || 'Contacto nuevo', telefono: maskPhone(item.telefono_normalizado),
  responsable: item.responsable?.nombre || null, cita: item.cita ? { fecha: item.cita.fecha, hora_inicio: String(item.cita.hora_inicio).slice(0, 5), hora_fin: item.cita.hora_fin ? String(item.cita.hora_fin).slice(0, 5) : null } : null,
  tiene_solicitud: Boolean(item.solicitud_cita_id), tiene_recordatorio: Boolean(item.recordatorio_id),
  tomada_en: item.tomada_en, resuelta_en: item.resuelta_en, cerrada_en: item.cerrada_en, created_at: item.created_at, updated_at: item.updated_at,
  ...(detail ? { responsable_id: item.responsable_usuario_id ? Number(item.responsable_usuario_id) : null, observacion: item.observacion_recepcion, resolucion: item.resolucion, historial: item.historial || [], solicitud: item.solicitud ? { nombre: item.solicitud.nombre_whatsapp, motivo: item.solicitud.motivo, fecha: item.solicitud.fecha_solicitada, hora_inicio: item.solicitud.hora_inicio ? String(item.solicitud.hora_inicio).slice(0, 5) : null, hora_fin: item.solicitud.hora_fin ? String(item.solicitud.hora_fin).slice(0, 5) : null, estado: item.solicitud.estado } : null } : {})
});
const audit = async ({ userId, referral, action, transaction }) => { const stamp = boliviaDateTime(); await ActividadSistema.create({ usuario_id: userId, paciente_id: referral.paciente_id || null, entidad_id: referral.id, fecha: stamp.fecha, hora: stamp.hora, modulo: 'Derivación WhatsApp', accion: action, detalle: `${action} una derivación de recepción`, datos: { derivacion_id: Number(referral.id), estado: referral.estado }, metodo: 'POST', ruta: `/api/whatsapp/derivaciones/${referral.id}` }, { transaction }); };
const history = (item, action, userId, now, extra = {}) => [...(Array.isArray(item.historial) ? item.historial : []), { accion: action, usuario_id: userId, fecha: now.toISOString(), ...extra }];
const list = async ({ query, model = WhatsappReceptionReferral }) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1); const limit = Math.min(50, Math.max(5, Number.parseInt(query.limit, 10) || 10)); const filters = {};
  if (REFERRAL_STATES.includes(query.estado)) filters.estado = query.estado;
  if (REFERRAL_TYPES.includes(query.tipo)) filters.tipo_derivacion = query.tipo;
  if (REFERRAL_PRIORITIES.includes(query.prioridad)) filters.prioridad = query.prioridad;
  if (/^\d+$/.test(query.responsable || '')) filters.responsable_usuario_id = Number(query.responsable);
  if (String(query.buscar || '').trim()) { const search = String(query.buscar).trim().slice(0, 100).replace(/[%_]/g, ''); filters[Op.or] = [{ telefono_normalizado: { [Op.iLike]: `%${search}%` } }, { '$paciente.nombres$': { [Op.iLike]: `%${search}%` } }]; }
  const result = await model.findAndCountAll({ where: filters, include: includes, distinct: true, subQuery: false, limit, offset: (page - 1) * limit, order: [[model.sequelize.literal(priorityOrder), 'ASC'], ['created_at', 'ASC']] });
  return { data: result.rows.map((item) => dto(item)), pagination: { page, limit, total: result.count, totalPages: Math.max(1, Math.ceil(result.count / limit)) } };
};
const get = async (id, model = WhatsappReceptionReferral) => { const item = await model.findByPk(id, { include: includes }); return item ? dto(item, true) : null; };
const mutate = async ({ id, user, action, value, db, model = WhatsappReceptionReferral, now = new Date() }) => db.transaction(async (transaction) => {
  const item = await model.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!item) throw Object.assign(new Error('Derivación no encontrada.'), { status: 404 });
  const own = Number(item.responsable_usuario_id) === Number(user.id); let changes;
  if (action === 'TOMADA') { if (item.estado !== 'PENDIENTE') throw Object.assign(new Error('La derivación ya fue tomada o cambió de estado.'), { status: 409, currentState: item.estado }); changes = { estado: 'EN_ATENCION', responsable_usuario_id: user.id, tomada_en: now }; }
  else if (action === 'PRIORIDAD') { if (user.rol !== 'admin' || !REFERRAL_PRIORITIES.includes(value)) throw Object.assign(new Error('Prioridad no válida o acción no autorizada.'), { status: user.rol === 'admin' ? 400 : 403 }); changes = { prioridad: value }; }
  else if (action === 'OBSERVACION') { if (!own && user.rol !== 'admin') throw Object.assign(new Error('Solo el responsable puede registrar observaciones.'), { status: 403 }); const text = String(value || '').trim(); if (!text || text.length > 500) throw Object.assign(new Error('La observación debe tener entre 1 y 500 caracteres.'), { status: 400 }); changes = { observacion_recepcion: text }; }
  else if (action === 'RESUELTA') { if (item.estado !== 'EN_ATENCION') throw Object.assign(new Error('La derivación no está en atención.'), { status: 409 }); if (!own && user.rol !== 'admin') throw Object.assign(new Error('Solo el responsable puede resolverla.'), { status: 403 }); const text = String(value || '').trim(); if (!text || text.length > 500) throw Object.assign(new Error('La resolución debe tener entre 1 y 500 caracteres.'), { status: 400 }); changes = { estado: 'RESUELTA', resolucion: text, resuelta_en: now }; }
  else if (action === 'CERRADA') { if (item.estado !== 'RESUELTA') throw Object.assign(new Error('Solo se puede cerrar una derivación resuelta.'), { status: 409 }); if (!own && user.rol !== 'admin') throw Object.assign(new Error('Solo el responsable puede cerrarla.'), { status: 403 }); changes = { estado: 'CERRADA', cerrada_en: now }; }
  changes.historial = history(item, action, user.id, now, action === 'PRIORIDAD' ? { prioridad: value } : {}); await item.update(changes, { transaction }); await audit({ userId: user.id, referral: item, action, transaction }); if (action === 'TOMADA' && typeof transaction.afterCommit === 'function') transaction.afterCommit(() => { const { assignedReferral } = require('./whatsappNotificationTrigger.service'); return assignedReferral(item); }); return item;
});
const summary = async (model = WhatsappReceptionReferral) => ({ pendientes: await model.count({ where: { estado: 'PENDIENTE' } }), en_atencion: await model.count({ where: { estado: 'EN_ATENCION' } }) });
module.exports = { maskPhone, dto, list, get, mutate, summary };
