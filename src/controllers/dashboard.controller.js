const { Op } = require('sequelize');
const { Cita, HistoriaClinica, InformeMedico, Paciente, Sesion } = require('../models');

const includePaciente = [{ model: Paciente, as: 'paciente' }];

const fechaLocal = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resumenDashboard = async (req, res, next) => {
  try {
    const hoy = fechaLocal();
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
        fecha: { [Op.gte]: fechaLocal() },
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
      where: { fecha: fechaLocal(), anulada: false },
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
