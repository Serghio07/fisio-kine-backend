const { ASSISTANT_TOOLS } = require('../../config/assistant/assistantTools');
const { getOperationalSummary } = require('./operationalSummary.service');

const TOOL_ACTIONS = Object.freeze({
  get_today_appointments: { type: 'navigate', route: '/citas', label: 'Abrir Agenda', permission: 'agenda' },
  get_today_sessions: { type: 'navigate', route: '/sesiones', label: 'Ir a Sesiones', permission: 'sesiones' },
  get_pending_notifications: { type: 'navigate', route: '/notificaciones', label: 'Ver Notificaciones', permission: null },
  get_my_pending_activities: { type: 'navigate', route: '/personal/actividades', label: 'Ir a Actividades', permission: 'actividadesPropias' },
  get_pending_whatsapp_requests: { type: 'navigate', route: '/whatsapp/recepcion', label: 'Abrir Recepción WhatsApp', permission: 'recepcionWhatsapp' },
  get_daily_operational_summary: { type: 'navigate', route: '/citas', label: 'Abrir Agenda', permission: 'agenda' }
});

function safeToolError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function executeAssistantTool(name, args, user, dependencies = {}) {
  const definition = ASSISTANT_TOOLS.find((tool) => tool.name === name);
  if (!definition) throw safeToolError('Herramienta no permitida.', 'TOOL_NOT_ALLOWED');
  if (!definition.allowedRoles.includes(user?.rol)) throw safeToolError('No tienes permiso para esa consulta.', 'TOOL_FORBIDDEN', 403);
  if (args && (typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length > 0)) {
    throw safeToolError('Los parámetros de la herramienta no están permitidos.', 'TOOL_ARGUMENTS_REJECTED');
  }
  const summary = await (dependencies.summaryProvider || getOperationalSummary)(user);
  const minimalResults = {
    get_today_appointments: () => ({ fecha: summary.fecha, total: summary.citas.total, pendientes: summary.citas.pendientes, confirmadas: summary.citas.confirmadas, proxima: summary.citas.proxima }),
    get_today_sessions: () => ({ fecha: summary.fecha, total: summary.sesiones.total, pendientes: summary.sesiones.pendientes, atendidas: summary.sesiones.atendidas }),
    get_pending_notifications: () => ({ pendientes: summary.notificaciones.pendientes }),
    get_my_pending_activities: () => ({ fecha: summary.fecha, total: summary.actividades.total, pendientes: summary.actividades.pendientes, completadas: summary.actividades.completadas }),
    get_pending_whatsapp_requests: () => ({ pendientes: summary.recepcion.pendientes, asignadasAlUsuario: summary.recepcion.asignadas }),
    get_daily_operational_summary: () => ({ fecha: summary.fecha, citas: summary.citas, sesiones: summary.sesiones, actividadesPendientes: summary.actividades.pendientes, notificacionesPendientes: summary.notificaciones.pendientes })
  };
  return { data: minimalResults[name](), action: TOOL_ACTIONS[name] };
}

module.exports = { executeAssistantTool, TOOL_ACTIONS };
