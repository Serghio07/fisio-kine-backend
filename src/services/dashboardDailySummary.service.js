const { Op } = require('sequelize');
const { ActividadSistema, Cita, HistoriaClinica, InformeMedico, MovimientoPago, Paciente, Sesion } = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');

const PENDING_STATES = ['Pendiente', 'Programada', 'Confirmada', 'Reprogramada'];
const FINISHED_STATES = ['Atendida', 'Cancelada', 'No asistio', 'Falto'];

const patientName = (patient) => [patient?.nombres, patient?.apellidos].filter(Boolean).join(' ').trim() || 'Paciente';
const timeMinutes = (time) => {
  const [hour, minute] = String(time || '').slice(0, 5).split(':').map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
};
const dayBounds = (date) => ({
  [Op.gte]: new Date(`${date}T00:00:00-04:00`),
  [Op.lt]: new Date(new Date(`${date}T00:00:00-04:00`).getTime() + 24 * 60 * 60 * 1000)
});

const getDashboardDailySummary = async (user, dependencies = {}) => {
  const models = { ActividadSistema, Cita, HistoriaClinica, InformeMedico, MovimientoPago, Paciente, Sesion, ...dependencies.models };
  const now = dependencies.now || new Date();
  const date = boliviaDate(now);
  const time = boliviaTime(now, false);
  const currentMinutes = timeMinutes(time);
  const isAdmin = user.rol === 'admin';
  const appointmentWhere = { fecha: date, ...(isAdmin ? {} : { profesional_id: user.id }) };
  const sessionWhere = { fecha: date, anulada: false, ...(isAdmin ? {} : { usuario_id: user.id }) };
  const activityWhere = { fecha: date, ...(isAdmin ? {} : { usuario_id: user.id }) };
  const patientInclude = [{ model: models.Paciente, as: 'paciente', required: true, attributes: ['id', 'nombres', 'apellidos'] }];

  const [appointments, attendedSessions, sessionsCompleted, historiesUpdated, reportsGenerated, administrativeActions, paymentsRegistered] = await Promise.all([
    models.Cita.findAll({
      where: appointmentWhere,
      attributes: ['id', 'paciente_id', 'fecha', 'hora_inicio', 'hora_fin', 'estado', 'numero_sesion', 'total_sesiones', 'sesion_id'],
      include: [...patientInclude, { model: models.Sesion, as: 'sesion_clinica', required: false, attributes: ['id', 'numero_sesion', 'asistencia'] }],
      order: [['hora_inicio', 'ASC']]
    }),
    models.Sesion.findAll({ where: { ...sessionWhere, asistencia: 'asistio' }, attributes: ['id', 'paciente_id', 'numero_sesion'], include: patientInclude, order: [['numero_sesion', 'ASC']] }),
    models.Sesion.count({ where: { ...sessionWhere, asistencia: 'asistio' } }),
    models.HistoriaClinica.count({ where: { updated_at: dayBounds(date), ...(isAdmin ? {} : { usuario_id: user.id }) } }),
    models.InformeMedico.count({ where: { fecha: date } }),
    models.ActividadSistema.count({ where: activityWhere }),
    isAdmin ? models.MovimientoPago.count({ where: { fecha: date, estado: 'Activo' } }) : Promise.resolve(null)
  ]);

  const plainAppointments = appointments.map((item) => typeof item.toJSON === 'function' ? item.toJSON() : item);
  const appointmentWasAttended = (item) => item.estado === 'Atendida' || item.sesion_clinica?.asistencia === 'asistio';
  const total = plainAppointments.length;
  const attended = plainAppointments.filter(appointmentWasAttended).length;
  const pending = plainAppointments.filter((item) => PENDING_STATES.includes(item.estado) && !appointmentWasAttended(item)).length;
  const noShow = plainAppointments.filter((item) => ['No asistio', 'Falto'].includes(item.estado)).length;
  const canceled = plainAppointments.filter((item) => item.estado === 'Cancelada').length;
  const upcoming = plainAppointments.filter((item) => {
    const start = timeMinutes(item.hora_inicio);
    return start !== null && start >= currentMinutes && !FINISHED_STATES.includes(item.estado) && !appointmentWasAttended(item);
  }).map((item) => ({ id: item.id, horaInicio: String(item.hora_inicio).slice(0, 5), paciente: patientName(item.paciente), estado: item.estado }));

  const attendedPatients = new Map();
  for (const item of plainAppointments.filter(appointmentWasAttended)) {
    attendedPatients.set(Number(item.paciente_id), { paciente: patientName(item.paciente), sesionActual: item.sesion_clinica?.numero_sesion || item.numero_sesion || null, totalSesiones: item.total_sesiones || null });
  }
  for (const rawSession of attendedSessions) {
    const session = typeof rawSession.toJSON === 'function' ? rawSession.toJSON() : rawSession;
    const existing = attendedPatients.get(Number(session.paciente_id));
    attendedPatients.set(Number(session.paciente_id), { paciente: patientName(session.paciente), sesionActual: session.numero_sesion || existing?.sesionActual || null, totalSesiones: existing?.totalSesiones || null });
  }

  const withinHour = upcoming.filter((item) => timeMinutes(item.horaInicio) - currentMinutes <= 60).length;
  const alerts = [];
  if (noShow) alerts.push({ tipo: 'NO_ASISTIO', mensaje: `${noShow} ${noShow === 1 ? 'paciente no asistió' : 'pacientes no asistieron'}` });
  if (pending) alerts.push({ tipo: 'PENDIENTES', mensaje: `${pending} ${pending === 1 ? 'cita sigue pendiente' : 'citas siguen pendientes'}` });
  if (withinHour) alerts.push({ tipo: 'PROXIMA_CITA', mensaje: `${withinHour} ${withinHour === 1 ? 'cita comienza' : 'citas comienzan'} dentro de la próxima hora` });

  return {
    fecha: date,
    zonaHoraria: 'America/La_Paz',
    citas: { total, atendidas: attended, pendientes: pending, noAsistio: noShow, canceladas: canceled },
    proximasCitas: upcoming,
    pacientesAtendidos: [...attendedPatients.values()],
    alertas: alerts,
    actividad: {
      sesionesRealizadas: sessionsCompleted,
      historiasActualizadas: historiesUpdated,
      informesGenerados: reportsGenerated,
      accionesAdministrativas: administrativeActions,
      ...(paymentsRegistered === null ? {} : { pagosRegistrados: paymentsRegistered })
    }
  };
};

module.exports = { getDashboardDailySummary, PENDING_STATES };
