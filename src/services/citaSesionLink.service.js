const { Op } = require('sequelize');
const { Cita, Sesion, sequelize } = require('../models');

const appointmentStateForAttendance = (attendance, currentState) => ({
  asistio: 'Atendida',
  no_asistio: 'No asistio',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada'
}[attendance] || currentState);

const ensureNoShowSession = async (appointment, { transaction, sessionModel = Sesion, appointmentModel = Cita } = {}) => {
  if (!['No asistio', 'Falto'].includes(appointment.estado)) return null;
  if (appointment.sesion_id) return sessionModel.findByPk(appointment.sesion_id, { transaction });
  let session = await sessionModel.findOne({
    where: {
      paciente_id: appointment.paciente_id,
      historia_clinica_id: appointment.historia_clinica_id || null,
      fecha: appointment.fecha,
      numero_sesion: appointment.numero_sesion || 1,
      asistencia: 'no_asistio',
      anulada: false
    },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (session) {
    const alreadyLinked = await appointmentModel.findOne({ where: { sesion_id: session.id }, transaction, lock: transaction?.LOCK?.UPDATE });
    if (alreadyLinked && Number(alreadyLinked.id) !== Number(appointment.id)) session = null;
  }
  if (!session) session = await sessionModel.create({
    paciente_id: appointment.paciente_id,
    historia_clinica_id: appointment.historia_clinica_id || null,
    usuario_id: appointment.profesional_id || appointment.usuario_id || null,
    fecha: appointment.fecha,
    numero_sesion: appointment.numero_sesion || 1,
    sesiones_debe: 0,
    sesiones_hizo: 0,
    asistencia: 'no_asistio',
    estado_pago: 'Sin costo',
    monto_sesion: 0,
    monto_pagado: 0,
    saldo_pendiente: 0,
    motivo_sin_costo: 'Inasistencia: no se realizó atención clínica.',
    aplica_farmacos: false,
    farmacos: [],
    observacion: 'Inasistencia registrada automáticamente desde la cita.'
  }, { transaction });
  await appointment.update({ sesion_id: session.id, estado: 'No asistio' }, { transaction });
  return session;
};

const findAndLockAppointmentForSession = async (payload, { transaction, appointmentModel = Cita } = {}) => appointmentModel.findOne({
  where: {
    paciente_id: payload.paciente_id,
    historia_clinica_id: payload.historia_clinica_id || null,
    fecha: payload.fecha,
    numero_sesion: payload.numero_sesion,
    sesion_id: null,
    estado: ['Programada', 'Confirmada', 'Pendiente', 'No asistio', 'Falto']
  },
  order: [['id', 'ASC']],
  transaction,
  lock: transaction?.LOCK?.UPDATE
});

const syncAppointmentFromSession = async (session, { transaction, appointmentModel = Cita } = {}) => {
  const appointment = await appointmentModel.findOne({ where: { sesion_id: session.id }, transaction, lock: transaction?.LOCK?.UPDATE });
  if (!appointment) return null;
  await appointment.update({ estado: appointmentStateForAttendance(session.asistencia, appointment.estado) }, { transaction });
  return appointment;
};

const backfillNoShowLinks = async ({ db = sequelize, appointmentModel = Cita } = {}) => db.transaction(async (transaction) => {
  const linked = await appointmentModel.findAll({ where: { estado: ['No asistio', 'Falto'], sesion_id: { [Op.ne]: null } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const used = new Set();
  for (const appointment of linked) {
    if (used.has(Number(appointment.sesion_id))) await appointment.update({ sesion_id: null }, { transaction });
    else used.add(Number(appointment.sesion_id));
  }
  const appointments = await appointmentModel.findAll({ where: { estado: ['No asistio', 'Falto'], sesion_id: null }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  for (const appointment of appointments) await ensureNoShowSession(appointment, { transaction, appointmentModel });
  return appointments.length;
});

module.exports = { appointmentStateForAttendance, ensureNoShowSession, findAndLockAppointmentForSession, syncAppointmentFromSession, backfillNoShowLinks };
