const { Op } = require('sequelize');
const { Cita, Sesion, sequelize } = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');
const { ensureNoShowSession } = require('./citaSesionLink.service');
const { cleanupTemporaryWhatsappNoShow } = require('./temporaryWhatsappPatientCleanup.service');

const ESTADOS_SIN_ASISTENCIA = ['Pendiente', 'Programada', 'Confirmada'];

const actualizarCitasNoAsistidas = async (transaction = null, {
  appointmentModel = Cita,
  sessionModel = Sesion,
  db = sequelize,
  cleanupTemporary = cleanupTemporaryWhatsappNoShow,
  ensureNoShow = ensureNoShowSession
} = {}) => {
  const fechaActual = boliviaDate();
  const horaActual = boliviaTime(new Date(), false);

  const execute = async (activeTransaction) => {
    const appointments = await appointmentModel.findAll({ where: {
        estado: { [Op.in]: ESTADOS_SIN_ASISTENCIA },
        sesion_id: null,
        [Op.or]: [
          { fecha: { [Op.lt]: fechaActual } },
          {
            fecha: fechaActual,
            [Op.or]: [
              { hora_fin: { [Op.lte]: horaActual } },
              { hora_fin: null, hora_inicio: { [Op.lte]: horaActual } }
            ]
          }
        ]
    }, transaction: activeTransaction, lock: activeTransaction.LOCK.UPDATE });
    for (const appointment of appointments) {
      let attendedSession = null;
      if (appointment.paciente_id && appointment.historia_clinica_id && appointment.fecha) {
        const exactSession = await sessionModel.findOne({
        where: {
          paciente_id: appointment.paciente_id,
          historia_clinica_id: appointment.historia_clinica_id,
          fecha: appointment.fecha,
          numero_sesion: appointment.numero_sesion,
          asistencia: 'asistio',
          anulada: false
        },
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE
        });
        const dateSessions = exactSession ? [] : await sessionModel.findAll({
        where: {
          paciente_id: appointment.paciente_id,
          historia_clinica_id: appointment.historia_clinica_id,
          fecha: appointment.fecha,
          asistencia: 'asistio',
          anulada: false
        },
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE
        });
        attendedSession = exactSession || (dateSessions.length === 1 ? dateSessions[0] : null);
      }
      if (attendedSession) {
        const alreadyLinked = await appointmentModel.findOne({ where: { sesion_id: attendedSession.id }, transaction: activeTransaction, lock: activeTransaction.LOCK.UPDATE });
        if (!alreadyLinked || Number(alreadyLinked.id) === Number(appointment.id)) {
          await appointment.update({ sesion_id: attendedSession.id, estado: 'Atendida' }, { transaction: activeTransaction });
          continue;
        }
      }
      await appointment.update({ estado: 'No asistio' }, { transaction: activeTransaction });
      const cleanup = await cleanupTemporary(appointment, { transaction: activeTransaction });
      if (!cleanup.temporary) await ensureNoShow(appointment, { transaction: activeTransaction });
    }
    // Also repairs temporary WhatsApp records that were marked as no-show by older code.
    const previousTemporaryNoShows = await appointmentModel.findAll({
      where: { estado: { [Op.in]: ['No asistio', 'Cancelada'] }, origen: 'WhatsApp' },
      transaction: activeTransaction,
      lock: activeTransaction.LOCK.UPDATE
    });
    for (const appointment of previousTemporaryNoShows) {
      await cleanupTemporary(appointment, { transaction: activeTransaction });
    }
    return [appointments.length];
  };
  return transaction ? execute(transaction) : db.transaction(execute);
};

module.exports = { actualizarCitasNoAsistidas };
