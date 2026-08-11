const BOTH = Object.freeze(['admin', 'personal']);
const emptyParameters = Object.freeze({ type: 'OBJECT', properties: {}, required: [] });

const defineTool = (name, description, roles = BOTH) => Object.freeze({
  name,
  description,
  allowedRoles: roles,
  readOnly: true,
  parameters: emptyParameters
});

const ASSISTANT_TOOLS = Object.freeze([
  defineTool('get_today_appointments', 'Obtiene únicamente el resumen de citas de hoy autorizado para el usuario autenticado.'),
  defineTool('get_today_sessions', 'Obtiene únicamente el resumen de sesiones de hoy autorizado para el usuario autenticado.'),
  defineTool('get_pending_notifications', 'Obtiene la cantidad de notificaciones pendientes del usuario autenticado.'),
  defineTool('get_my_pending_activities', 'Obtiene el resumen de actividades de hoy permitido para el usuario autenticado.'),
  defineTool('get_pending_whatsapp_requests', 'Obtiene cantidades operativas de solicitudes de recepción WhatsApp permitidas.'),
  defineTool('get_daily_operational_summary', 'Obtiene un resumen mínimo de citas, sesiones, actividades y notificaciones del día.')
]);

const GEMINI_FUNCTION_DECLARATIONS = Object.freeze(ASSISTANT_TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })));

module.exports = { ASSISTANT_TOOLS, GEMINI_FUNCTION_DECLARATIONS };
