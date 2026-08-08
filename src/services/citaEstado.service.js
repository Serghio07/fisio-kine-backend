const { Op } = require('sequelize');
const { Cita, sequelize } = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');
const { ensureNoShowSession } = require('./citaSesionLink.service');
const { cleanupTemporaryWhatsappNoShow } = require('./temporaryWhatsappPatientCleanup.service');

const ESTADOS_SIN_ASISTENCIA = ['Pendiente', 'Programada', 'Confirmada'];

const actualizarCitasNoAsistidas = async (transaction = null, {
  appointmentModel = Cita,
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
              { hora_fin: { [Op.lt]: horaActual } },
              { hora_fin: null, hora_inicio: { [Op.lt]: horaActual } }
            ]
          }
        ]
      }, transaction: activeTransaction, lock: activeTransaction.LOCK.UPDATE });
    for (const appointment of appointments) {
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
