const { Op } = require('sequelize');
const { Cita, HistoriaClinica, InformeMedico, Paciente, Sesion } = require('../models');
const { boliviaDate } = require('../utils/boliviaDateTime');

const includePaciente = [{ model: Paciente, as: 'paciente' }];

const resumenDashboard = async (req, res, next) => {
  try {
    const hoy = boliviaDate();
    const [totalPacientes, citasHoy, sesionesHoy, atendidosHoy, citasPendientes, informesGenerados] = await Promise.all([
      Paciente.count(),
      Cita.count({ where: { fecha: hoy } }),
      Sesion.count({ where: { fecha: hoy, anulada: false } }),
      Sesion.count({ where: { fecha: hoy, asistencia: 'asistio', anulada: false } }),
      Cita.count({ where: { estado: { [Op.in]: ['Pendiente', 'Confirmada'] } } }),
      InformeMedico.count()
    ]);

    return res.json({
      totalPacientes,
      citasHoy,
      sesionesHoy,
      atendidosHoy,
      citasPendientes,
      informesGenerados
    });
  } catch (error) {
    return next(error);
  }
};

const proximasCitas = async (req, res, next) => {
  try {
    const citas = await Cita.findAll({
      where: {
        fecha: { [Op.gte]: boliviaDate() },
        estado: { [Op.ne]: 'Cancelada' }
      },
      include: includePaciente,
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
      limit: 8
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const sesionesHoy = async (req, res, next) => {
  try {
    const sesiones = await Sesion.findAll({
      where: { fecha: boliviaDate(), anulada: false },
      include: includePaciente,
      order: [['id', 'DESC']],
      limit: 8
    });
    return res.json(sesiones);
  } catch (error) {
    return next(error);
  }
};

const pacientesRecientes = async (req, res, next) => {
  try {
    const pacientes = await Paciente.findAll({
      include: [{ model: HistoriaClinica, as: 'historias_clinicas', limit: 1, order: [['fecha_evaluacion', 'DESC']] }],
      order: [['created_at', 'DESC']],
      limit: 8
    });
    return res.json(pacientes);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  resumenDashboard,
  proximasCitas,
  sesionesHoy,
  pacientesRecientes
};
