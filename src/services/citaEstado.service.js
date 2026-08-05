const { Op } = require('sequelize');
const { Cita, sequelize } = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');
const { ensureNoShowSession } = require('./citaSesionLink.service');

const ESTADOS_SIN_ASISTENCIA = ['Pendiente', 'Programada', 'Confirmada'];

const actualizarCitasNoAsistidas = async (transaction = null) => {
  const fechaActual = boliviaDate();
  const horaActual = boliviaTime(new Date(), false);

  const execute = async (activeTransaction) => {
    const appointments = await Cita.findAll({ where: {
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
      await ensureNoShowSession(appointment, { transaction: activeTransaction });
    }
    return [appointments.length];
  };
  return transaction ? execute(transaction) : sequelize.transaction(execute);
};

module.exports = { actualizarCitasNoAsistidas };
