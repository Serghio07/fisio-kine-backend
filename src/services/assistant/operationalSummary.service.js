const { Op } = require('sequelize');
const { Cita, Sesion, TareaPersonal, InternalNotification, WhatsappReceptionReferral } = require('../../models');
const { boliviaDate, boliviaTime } = require('../../utils/boliviaDateTime');

const PENDING_APPOINTMENTS = ['Pendiente', 'Programada', 'Reprogramada'];
const ACTIVE_REFERRALS = ['PENDIENTE', 'EN_ATENCION'];

const buildOperationalScopes = (user, fecha) => {
  const userId = Number(user.id);
  const isAdmin = user.rol === 'admin';
  return {
    userId,
    isAdmin,
    taskScope: isAdmin ? { fecha } : { fecha, usuario_id: userId },
    appointmentScope: isAdmin ? { fecha } : { fecha, profesional_id: userId },
    sessionScope: isAdmin ? { fecha, anulada: false } : { fecha, anulada: false, usuario_id: userId }
  };
};

async function getOperationalSummary(user) {
  const fecha = boliviaDate();
  const { userId, isAdmin, taskScope, appointmentScope, sessionScope } = buildOperationalScopes(user, fecha);
  const currentTime = boliviaTime(undefined, false);
  const [citasTotal, citasPendientes, citasConfirmadas, proximaCita, sesionesTotal, sesionesPendientes, sesionesAtendidas, notificacionesPendientes, notificacionesTotal, actividadesTotal, actividadesPendientes, actividadesCompletadas, solicitudesPendientes, solicitudesAsignadas] = await Promise.all([
    Cita.count({ where: { ...appointmentScope, estado: { [Op.ne]: 'Cancelada' } } }),
    Cita.count({ where: { ...appointmentScope, estado: { [Op.in]: PENDING_APPOINTMENTS } } }),
    Cita.count({ where: { ...appointmentScope, estado: 'Confirmada' } }),
    Cita.findOne({ where: { ...appointmentScope, hora_inicio: { [Op.gte]: currentTime }, estado: { [Op.notIn]: ['Cancelada', 'Atendida', 'No asistio', 'Falto'] } }, attributes: ['hora_inicio', 'estado'], order: [['hora_inicio', 'ASC']] }),
    Sesion.count({ where: sessionScope }),
    Sesion.count({ where: { ...sessionScope, asistencia: 'pendiente' } }),
    Sesion.count({ where: { ...sessionScope, asistencia: 'asistio' } }),
    InternalNotification.count({ where: { usuario_id: userId, estado: 'NO_LEIDA' } }),
    InternalNotification.count({ where: { usuario_id: userId } }),
    TareaPersonal.count({ where: taskScope }),
    TareaPersonal.count({ where: { ...taskScope, estado: { [Op.in]: ['pendiente', 'en_progreso'] } } }),
    TareaPersonal.count({ where: { ...taskScope, estado: 'completada' } }),
    WhatsappReceptionReferral.count({ where: { estado: 'PENDIENTE' } }),
    WhatsappReceptionReferral.count({ where: { responsable_usuario_id: userId, estado: { [Op.in]: ACTIVE_REFERRALS } } })
  ]);
  return {
    fecha,
    citas: { total: citasTotal, pendientes: citasPendientes, confirmadas: citasConfirmadas, proxima: proximaCita ? { hora: String(proximaCita.hora_inicio || '').slice(0, 5), estado: proximaCita.estado } : null },
    sesiones: { total: sesionesTotal, pendientes: sesionesPendientes, atendidas: sesionesAtendidas },
    notificaciones: { total: notificacionesTotal, pendientes: notificacionesPendientes },
    actividades: { total: actividadesTotal, pendientes: actividadesPendientes, completadas: actividadesCompletadas, alcance: isAdmin ? 'global' : 'propio' },
    recepcion: { pendientes: solicitudesPendientes, asignadas: solicitudesAsignadas }
  };
}

module.exports = { buildOperationalScopes, getOperationalSummary };
