const { HistoriaClinica, Paciente } = require('../models');
const { validarImagen } = require('../utils/imagen');

const validarPaciente = ({ nombres, sexo }) => {
  if (!nombres) return 'nombres es requerido';
  if (sexo && !['M', 'F', 'Otro'].includes(sexo)) return 'sexo solo puede ser M, F u Otro';
  return null;
};

const listarPacientes = async (req, res, next) => {
  try {
    const pacientes = await Paciente.findAll({
      include: [{
        model: HistoriaClinica,
        as: 'historias_clinicas',
        attributes: ['diagnostico_medico', 'fecha_evaluacion'],
        separate: true,
        limit: 1,
        order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
      }],
      order: [['id', 'ASC']]
    });
    return res.json(pacientes);
  } catch (error) {
    return next(error);
  }
};

const obtenerPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });
    return res.json(paciente);
  } catch (error) {
    return next(error);
  }
};

const crearPaciente = async (req, res, next) => {
  try {
    const errorValidacion = validarPaciente(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    const errorImagen = validarImagen(req.body.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    const paciente = await Paciente.create(req.body);
    return res.status(201).json(paciente);
  } catch (error) {
    return next(error);
  }
};

const actualizarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const errorValidacion = validarPaciente({ ...paciente.toJSON(), ...req.body });
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    const errorImagen = validarImagen(req.body.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    await paciente.update(req.body);
    return res.json(paciente);
  } catch (error) {
    return next(error);
  }
};

const eliminarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    await paciente.destroy();
    return res.json({ message: 'Paciente eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarPacientes,
  obtenerPaciente,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente
};
