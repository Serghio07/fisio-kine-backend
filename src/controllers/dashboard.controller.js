const { Op } = require('sequelize');
const { Cita, HistoriaClinica, InformeMedico, Paciente, Sesion } = require('../models');
const { boliviaDate } = require('../utils/boliviaDateTime');

const includePaciente = [{ model: Paciente, as: 'paciente' }];
const ESTADOS_CITA_PENDIENTE = ['Pendiente', 'Programada', 'Confirmada', 'Reprogramada'];

const resumenDashboard = async (req, res, next) => {
  try {
    const hoy = boliviaDate();
    const [totalPacientes, citasHoy, sesionesHoy, atendidosHoy, citasPendientes, sesionesPendientes, informesGenerados] = await Promise.all([
      Paciente.count({ where: { estado: true } }),
      Cita.count({ where: { fecha: hoy, estado: { [Op.ne]: 'Cancelada' } } }),
      Sesion.count({ where: { fecha: hoy, anulada: false } }),
      Cita.count({ distinct: true, col: 'paciente_id', where: { fecha: hoy, estado: 'Atendida' } }),
      Cita.count({ where: { fecha: hoy, estado: { [Op.in]: ESTADOS_CITA_PENDIENTE } } }),
      Cita.count({ where: { fecha: hoy, origen: 'Plan de tratamiento', estado: { [Op.in]: ESTADOS_CITA_PENDIENTE } } }),
      InformeMedico.count({ where: { fecha: hoy } })
    ]);

    return res.json({
      totalPacientes,
      citasHoy,
      sesionesHoy,
      atendidosHoy,
      citasPendientes,
      sesionesPendientes,
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
        estado: { [Op.in]: ESTADOS_CITA_PENDIENTE }
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

const notificaciones = async (req, res, next) => {
  try {
    const hoy = boliviaDate();
    const citas = await Cita.findAll({
      where: {
        fecha: { [Op.gte]: hoy },
        estado: { [Op.in]: ESTADOS_CITA_PENDIENTE }
      },
      include: includePaciente,
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']],
      limit: 30
    });
    return res.json(citas.map((cita) => {
      const item = cita.toJSON();
      const esSesion = item.origen === 'Plan de tratamiento' || Boolean(item.numero_sesion);
      return {
        id: `${esSesion ? 'sesion' : 'cita'}-${item.id}`,
        cita_id: item.id,
        tipo: esSesion ? 'sesion' : 'cita',
        titulo: esSesion ? `Sesión ${item.numero_sesion || ''} programada`.trim() : 'Cita programada',
        mensaje: `${item.paciente?.nombres || 'Paciente'} ${item.paciente?.apellidos || ''}`.trim(),
        fecha: item.fecha,
        hora: String(item.hora_inicio || '').slice(0, 5),
        estado: item.estado,
        paciente_id: item.paciente_id,
        historia_clinica_id: item.historia_clinica_id || null,
        es_hoy: item.fecha === hoy
      };
    }));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  resumenDashboard,
  proximasCitas,
  sesionesHoy,
  pacientesRecientes,
  notificaciones
};
