const { Op } = require('sequelize');
const { Cita } = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');

const ESTADOS_SIN_ASISTENCIA = ['Pendiente', 'Programada', 'Confirmada'];

const actualizarCitasNoAsistidas = async (transaction = null) => {
  const fechaActual = boliviaDate();
  const horaActual = boliviaTime(new Date(), false);

  return Cita.update(
    { estado: 'No asistio' },
    {
      where: {
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
      },
      transaction
    }
  );
};

module.exports = { actualizarCitasNoAsistidas };
