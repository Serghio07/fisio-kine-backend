const { Op } = require('sequelize');
const { Cita, Sesion, sequelize } = require('../models');

const appointmentStateForAttendance = (attendance, currentState) => ({
  asistio: 'Atendida',
  no_asistio: 'No asistio',
  reprogramada: 'Reprogramada',
  cancelada: 'Cancelada'
}[attendance] || currentState);

// La inasistencia pertenece a la agenda y no debe crear atenciones clinicas.
// Conservamos cualquier vinculo ya existente, pero nunca agregamos sesiones.
const ensureNoShowSession = async (appointment, { transaction, sessionModel = Sesion } = {}) => {
  if (!['No asistio', 'Falto'].includes(appointment.estado)) return null;
  return appointment.sesion_id ? sessionModel.findByPk(appointment.sesion_id, { transaction }) : null;
};

const findAndLockAppointmentForSession = async (payload, { transaction, appointmentModel = Cita } = {}) => {
  const commonWhere = {
    paciente_id: payload.paciente_id,
    historia_clinica_id: payload.historia_clinica_id || null,
    fecha: payload.fecha,
    sesion_id: null,
    estado: ['Programada', 'Confirmada', 'Pendiente', 'No asistio', 'Falto']
  };
  const options = { order: [['numero_sesion', 'ASC'], ['id', 'ASC']], transaction, lock: transaction?.LOCK?.UPDATE };
  const exact = await appointmentModel.findOne({ where: { ...commonWhere, numero_sesion: payload.numero_sesion }, ...options });
  return exact || appointmentModel.findOne({ where: commonWhere, ...options });
};

const syncAppointmentFromSession = async (session, { transaction, appointmentModel = Cita } = {}) => {
  const appointment = await appointmentModel.findOne({ where: { sesion_id: session.id }, transaction, lock: transaction?.LOCK?.UPDATE });
  if (!appointment) return null;
  await appointment.update({ estado: appointmentStateForAttendance(session.asistencia, appointment.estado) }, { transaction });
  return appointment;
};

const reconcileAttendedAppointments = async ({ db = sequelize, appointmentModel = Cita, sessionModel = Sesion } = {}) => db.transaction(async (transaction) => {
  const appointments = await appointmentModel.findAll({
    where: {
      origen: 'Plan de tratamiento',
      estado: { [Op.in]: ['Pendiente', 'Programada', 'Confirmada', 'No asistio', 'Falto'] }
    },
    order: [['fecha', 'ASC'], ['numero_sesion', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  if (!appointments.length) return 0;

  const linked = await appointmentModel.findAll({ attributes: ['sesion_id'], where: { sesion_id: { [Op.ne]: null } }, transaction });
  const usedSessionIds = new Set(linked.map((item) => Number(item.sesion_id)).filter(Boolean));
  const allSessions = await sessionModel.findAll({
    where: {
      paciente_id: { [Op.in]: [...new Set(appointments.map((item) => item.paciente_id))] },
      asistencia: 'asistio',
      anulada: false
    },
    order: [['fecha', 'ASC'], ['numero_sesion', 'ASC'], ['id', 'ASC']],
    transaction
  });
  let repaired = 0;
  for (const appointment of appointments) {
    const historySessions = allSessions.filter((session) => !usedSessionIds.has(Number(session.id))
      && Number(session.paciente_id) === Number(appointment.paciente_id)
      && Number(session.historia_clinica_id) === Number(appointment.historia_clinica_id));
    const sameDate = historySessions.filter((session) => String(session.fecha) === String(appointment.fecha));
    const exactDate = sameDate.find((session) => Number(session.numero_sesion) === Number(appointment.numero_sesion));
    const exactNumber = historySessions.filter((session) => Number(session.numero_sesion) === Number(appointment.numero_sesion));
    const session = exactDate || (sameDate.length === 1 ? sameDate[0] : null) || (exactNumber.length === 1 ? exactNumber[0] : null);
    if (!session) continue;
    if (appointment.sesion_id && Number(appointment.sesion_id) !== Number(session.id)) {
      const previousSession = await sessionModel.findByPk(appointment.sesion_id, { transaction, lock: transaction.LOCK.UPDATE });
      if (previousSession?.asistencia === 'no_asistio' && !previousSession.anulada) {
        await previousSession.update({
          anulada: true,
          motivo_anulacion: 'Corrección automática de asistencia',
          observacion_anulacion: 'La cita tenía una sesión realizada vinculable y prevalece la atención registrada.'
        }, { transaction });
      }
    }
    await appointment.update({ sesion_id: session.id, estado: 'Atendida' }, { transaction });
    usedSessionIds.add(Number(session.id));
    repaired += 1;
  }
  return repaired;
});

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

module.exports = { appointmentStateForAttendance, ensureNoShowSession, findAndLockAppointmentForSession, syncAppointmentFromSession, reconcileAttendedAppointments, backfillNoShowLinks };
