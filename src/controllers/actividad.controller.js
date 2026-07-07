const { ActividadSistema, Paciente, Personal, Usuario } = require('../models');

const listarActividades = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.fecha) where.fecha = req.query.fecha;
    if (req.usuario.rol !== 'admin') where.usuario_id = req.usuario.id;
    const actividades = await ActividadSistema.findAll({
      where,
      include: [
        {
          model: Usuario,
          as: 'usuario',
          attributes: ['id', 'nombre', 'usuario', 'rol'],
          include: [{ model: Personal, as: 'ficha_personal' }]
        },
        {
          model: Paciente,
          as: 'paciente',
          attributes: {
            exclude: ['foto']
          }
        }
      ],
      order: [['fecha', 'DESC'], ['hora', 'DESC'], ['id', 'DESC']],
      limit: 1000
    });
    return res.json(actividades);
  } catch (error) {
    return next(error);
  }
};

module.exports = { listarActividades };
