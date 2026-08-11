const { requestGemini, completeAfterTools, getGeminiConfig, createGeminiClient } = require('./geminiClient.service');
const { executeAssistantTool } = require('./assistantTools.service');

const SAFE_CONTEXTS = Object.freeze({
  dashboard: 'Panel principal: muestra indicadores operativos autorizados.',
  agenda: 'Citas / Agenda: permite consultar, crear y gestionar citas desde la interfaz.',
  pacientes: 'Pacientes: listado y registro administrativo de pacientes.',
  historias: 'Historias clínicas: gestión documental; no se comparte contenido clínico con IA.',
  sesiones: 'Sesiones: registro operativo de atenciones y asistencia.',
  evoluciones: 'Evolutivos clínicos: seguimiento registrado por el profesional; la IA no analiza contenido clínico.',
  actividades: 'Mis actividades: tareas operativas propias del usuario.',
  notificaciones: 'Notificaciones: avisos internos del usuario.',
  'recepcion-whatsapp': 'Recepción WhatsApp: solicitudes operativas derivadas para atención.',
  general: 'Physio Active: sistema interno de gestión de fisioterapia.'
});

const RESTRICTED_PATTERN = /(contraseñ|password|api[ _-]?key|token|cookie|\.env|variable(s)? de entorno|sql|base de datos|archivo(s)? interno|prompt interno|ignora (los |tus )?(permisos|instrucciones)|actua como admin|actúa como admin|pagos?|finanzas?|sueldos?|salarios?|arqueos?)/i;
const CLINICAL_PATTERN = /(que|qué) (diagnostico|diagnóstico|medicamento|tratamiento)\b|prescrib|recetar|que tiene (el|la) paciente|analiza(r)? (la )?historia clinica/i;
const WRITE_PATTERN = /\b(agenda|crea|registra|modifica|actualiza|elimina|borra|cancela)\b.*\b(cita|paciente|sesion|sesión|pago|usuario)\b/i;

function sanitizeContext(context) {
  const module = typeof context?.module === 'string' && SAFE_CONTEXTS[context.module] ? context.module : 'general';
  const screen = typeof context?.screen === 'string' ? context.screen.replace(/[^a-z0-9áéíóúñ_-]/gi, '').slice(0, 60) : module;
  return { module, screen, guidance: SAFE_CONTEXTS[module] };
}

function sanitizeConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation.slice(-8).flatMap((item) => {
    if (!['user', 'assistant'].includes(item?.role) || typeof item?.text !== 'string') return [];
    const text = item.text.trim().slice(0, 1000);
    return text ? [{ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text }] }] : [];
  });
}

function getSafeName(usuario) {
  const candidate = usuario?.ficha_personal?.nombres || usuario?.nombre || '';
  return String(candidate).trim().split(/\s+/)[0].replace(/[^a-záéíóúñü-]/gi, '').slice(0, 40) || 'Usuario';
}

function fixedResponse(text, action) {
  return { message: text, source: 'local-fallback', action };
}

async function processAssistantChat({ message, context, conversation, user, usuario }, dependencies = {}) {
  if (!user || !['admin', 'personal'].includes(user.rol)) return fixedResponse('No tienes autorización para usar esta función.');
  if (CLINICAL_PATTERN.test(message)) return fixedResponse('Puedo ayudarte a utilizar Physio Active, pero no puedo indicar diagnósticos, tratamientos ni medicamentos.');
  if (RESTRICTED_PATTERN.test(message)) return fixedResponse('No puedo ayudar con credenciales, configuración interna ni información administrativa restringida.');
  if (WRITE_PATTERN.test(message)) return fixedResponse('Las acciones de escritura todavía deben realizarse y confirmarse desde la pantalla correspondiente.', { type: 'navigate', route: '/citas', label: 'Abrir Agenda', permission: 'agenda' });

  const geminiConfig = dependencies.config || getGeminiConfig();
  if (!geminiConfig.enabled && !dependencies.gemini) return { ...fixedResponse('El asistente inteligente no está configurado actualmente.'), unavailable: true };

  const safeContext = sanitizeContext(context);
  const identity = `Nombre: ${getSafeName(usuario)}. Rol funcional: ${user.rol === 'admin' ? 'Administrador' : 'Personal'}. Pantalla actual: ${safeContext.module} / ${safeContext.screen}. Conocimiento relevante: ${safeContext.guidance}`;
  const contents = [...sanitizeConversation(conversation), { role: 'user', parts: [{ text: `${identity}\nConsulta actual: ${message}` }] }];
  try {
    const client = dependencies.client || (dependencies.gemini ? null : await createGeminiClient(geminiConfig));
    const ask = dependencies.gemini?.request || requestGemini;
    const first = await ask({ contents, client, config: geminiConfig });
    if (first.unavailable) return { ...fixedResponse('El asistente inteligente no está configurado actualmente.'), unavailable: true };
    if (!first.functionCalls?.length) {
      return first.text ? { message: first.text, source: 'gemini', usage: first.usage } : fixedResponse('No pude procesar esa consulta con el asistente inteligente. Puedes intentar nuevamente.');
    }
    const calls = first.functionCalls.slice(0, 2);
    const executed = [];
    let action;
    for (const call of calls) {
      const result = await (dependencies.executeTool || executeAssistantTool)(call.name, call.args || {}, user);
      executed.push({ name: call.name, data: result.data });
      action ||= result.action;
    }
    const finish = dependencies.gemini?.complete || completeAfterTools;
    const final = await finish({ contents, modelContent: first.modelContent, toolResults: executed, client, config: geminiConfig });
    return final.text ? { message: final.text, source: 'gemini', action, usage: final.usage } : fixedResponse('Consulté la información autorizada, pero no pude redactar la respuesta. Intenta nuevamente.', action);
  } catch (error) {
    console.error('assistant request failed', { code: error?.code || error?.name || 'EXTERNAL_ERROR' });
    return fixedResponse('No pude procesar esa consulta con el asistente inteligente. Puedes intentar nuevamente.');
  }
}

module.exports = { processAssistantChat, sanitizeContext, sanitizeConversation };
