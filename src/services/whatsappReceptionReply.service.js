const crypto = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { WhatsappReceptionReferral, WhatsappReceptionReply, WhatsappEvento } = require('../models');
const { sendTextMessage, sendTemplateMessage } = require('./whatsapp.service');
const { getWhatsappManualRepliesEnabled, getWhatsappManualReplyWindowHours, getWhatsappManualReplyPreviewMinutes, getWhatsappManualReplyMaxAttempts, getWhatsappManualReplyRetryMinutes } = require('../config/whatsapp');
const incidentService=require('./whatsappIncident.service');

const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
const maskPhone = (phone) => { const value = String(phone || ''); return value.length > 6 ? `${value.slice(0, 3)}${'*'.repeat(value.length - 6)}${value.slice(-3)}` : '*'.repeat(value.length); };
const sanitizeText = (value) => {
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!text || text.length > 1000) throw fail('El mensaje debe tener entre 1 y 1000 caracteres.');
  if (/<[^>]+>/.test(text)) throw fail('El mensaje no puede contener HTML.');
  return text.replace(/\n{3,}/g, '\n\n');
};
const authorize = (referral, user) => {
  if (referral.estado !== 'EN_ATENCION') throw fail('Solo se puede responder una derivación en atención.', 409);
  if (user.rol !== 'admin' && Number(referral.responsable_usuario_id) !== Number(user.id)) throw fail('Solo el responsable asignado puede responder.', 403);
};
const windowStatus = async ({ phone, now = new Date(), eventModel = WhatsappEvento }) => {
  const last = await eventModel.findOne({ where: { telefono: phone, direccion: 'ENTRANTE', tipo_evento: 'MENSAJE_RECIBIDO' }, order: [['created_at', 'DESC']], attributes: ['created_at'] });
  if (!last?.created_at) return { estado: 'INDETERMINADA', abierta: false, ultimo_mensaje_en: null };
  const closesAt = new Date(new Date(last.created_at).getTime() + getWhatsappManualReplyWindowHours() * 3600000);
  return { estado: closesAt > now ? 'ABIERTA' : 'CERRADA', abierta: closesAt > now, ultimo_mensaje_en: last.created_at, cierra_en: closesAt };
};
const dto = (reply) => ({ id: Number(reply.id), tipo_envio: reply.tipo_envio, mensaje: reply.mensaje_texto, estado: reply.estado, intentos: reply.intentos, telefono: maskPhone(reply.telefono_normalizado), expira_en: reply.expira_en, created_at: reply.created_at, enviado_en: reply.enviado_en, entregado_en: reply.entregado_en, leido_en: reply.leido_en, error: reply.error_resumen });
const configuration = async ({ id, user, now = new Date(), referralModel = WhatsappReceptionReferral, eventModel = WhatsappEvento }) => { const referral = await referralModel.findByPk(id); if (!referral) throw fail('Derivación no encontrada.', 404); authorize(referral, user); return { enabled: getWhatsappManualRepliesEnabled(), max_length: 1000, templates: [], ventana: await windowStatus({ phone: referral.telefono_normalizado, now, eventModel }) }; };
const preview = async ({ id, user, body, now = new Date(), db = sequelize, referralModel = WhatsappReceptionReferral, replyModel = WhatsappReceptionReply, eventModel = WhatsappEvento }) => {
  const referral = await referralModel.findByPk(id); if (!referral) throw fail('Derivación no encontrada.', 404); authorize(referral, user);
  if (body?.tipo_envio && body.tipo_envio !== 'TEXTO_LIBRE') throw fail('No hay una plantilla aprobada y configurada para esta respuesta.', 409);
  const ventana = await windowStatus({ phone: referral.telefono_normalizado, now, eventModel }); if (!ventana.abierta) throw fail('La ventana de atención no está abierta; se requiere una plantilla aprobada.', 409);
  const message = sanitizeText(body?.mensaje); const expires = new Date(now.getTime() + getWhatsappManualReplyPreviewMinutes() * 60000);
  const key = crypto.createHash('sha256').update(`${id}:${user.id}:${crypto.randomUUID()}`).digest('hex');
  const reply = await replyModel.create({ derivacion_id: referral.id, usuario_id: user.id, telefono_normalizado: referral.telefono_normalizado, tipo_envio: 'TEXTO_LIBRE', mensaje_texto: message, parametros_plantilla: [], estado: 'PENDIENTE_CONFIRMACION', expira_en: expires, idempotency_key: key });
  return { ...dto(reply), ventana };
};
const list = async ({ id, user, referralModel = WhatsappReceptionReferral, replyModel = WhatsappReceptionReply }) => { const referral = await referralModel.findByPk(id); if (!referral) throw fail('Derivación no encontrada.', 404); authorize(referral, user); return (await replyModel.findAll({ where: { derivacion_id: id }, order: [['created_at', 'DESC']], limit: 20 })).map(dto); };
const classify = (result) => ({ code: String(result?.code || 'UNKNOWN').slice(0, 100), category: ['TIMEOUT', 'NETWORK_ERROR'].includes(result?.code) || Number(result?.status) >= 500 ? 'TRANSITORIO' : 'PERMANENTE', summary: String(result?.message || 'No se pudo enviar').slice(0, 500) });
const confirm = async ({ id, replyId, user, retry = false, now = new Date(), db = sequelize, referralModel = WhatsappReceptionReferral, replyModel = WhatsappReceptionReply, eventModel = WhatsappEvento, senderText = sendTextMessage, senderTemplate = sendTemplateMessage }) => {
  if (!getWhatsappManualRepliesEnabled()) throw fail('Las respuestas manuales de WhatsApp están deshabilitadas.', 503);
  let claimed;
  await db.transaction(async (transaction) => { const referral = await referralModel.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!referral) throw fail('Derivación no encontrada.', 404); authorize(referral, user); const reply = await replyModel.findOne({ where: { id: replyId, derivacion_id: id }, transaction, lock: transaction.LOCK.UPDATE }); if (!reply) throw fail('Vista previa no encontrada.', 404); if (['PROCESANDO','ACEPTADO_META','ENVIADO','ENTREGADO','LEIDO'].includes(reply.estado)) { claimed = null; return; } if (Number(reply.usuario_id) !== Number(user.id) && user.rol !== 'admin') throw fail('La vista previa pertenece a otro usuario.', 403); if (!retry && reply.estado !== 'PENDIENTE_CONFIRMACION') throw fail('La vista previa ya no se puede confirmar.', 409); if (retry && !['REINTENTO','FALLIDO'].includes(reply.estado)) throw fail('La respuesta no admite reintento.', 409); if (retry && reply.proximo_intento_en && new Date(reply.proximo_intento_en) > now) throw fail('El reintento todavía no está disponible.', 409); if (new Date(reply.expira_en) <= now && !retry) { await reply.update({ estado: 'EXPIRADO' }, { transaction }); throw fail('La vista previa expiró.', 409); } if (reply.intentos >= getWhatsappManualReplyMaxAttempts()) throw fail('Se alcanzó el máximo de intentos.', 409); if (reply.tipo_envio === 'TEXTO_LIBRE') { const last = await eventModel.findOne({ where: { telefono: referral.telefono_normalizado, direccion: 'ENTRANTE', tipo_evento: 'MENSAJE_RECIBIDO' }, order: [['created_at', 'DESC']], attributes: ['created_at'], transaction }); if (!last?.created_at || new Date(last.created_at).getTime() + getWhatsappManualReplyWindowHours() * 3600000 <= now.getTime()) throw fail('La ventana de atención cerró antes de confirmar; se requiere una plantilla aprobada.', 409); } await reply.update({ estado: 'PROCESANDO', intentos: reply.intentos + 1, confirmado_en: reply.confirmado_en || now, ultimo_intento_en: now, error_codigo: null, error_categoria: null, error_resumen: null }, { transaction }); claimed = reply; });
  if (!claimed) return dto(await replyModel.findByPk(replyId));
  const result = claimed.tipo_envio === 'TEXTO_LIBRE' ? await senderText(claimed.telefono_normalizado, claimed.mensaje_texto) : await senderTemplate(claimed.telefono_normalizado, { name: claimed.plantilla_nombre, language: claimed.plantilla_idioma }, claimed.parametros_plantilla);
  if (result.success) { await claimed.update({ estado: 'ACEPTADO_META', meta_message_id: result.messageId, aceptado_en: now }); await incidentService.markRecovered({type:'RESPUESTA_RECEPCION',entityId:claimed.id}).catch(()=>{}); }
  else { const error = classify(result); const retryable = error.category === 'TRANSITORIO' && claimed.intentos < getWhatsappManualReplyMaxAttempts(); await claimed.update({ estado: retryable ? 'REINTENTO' : 'FALLIDO', fallido_en: now, proximo_intento_en: retryable ? new Date(now.getTime() + getWhatsappManualReplyRetryMinutes() * 60000) : null, error_codigo: error.code, error_categoria: error.category, error_resumen: error.summary }); if (!retryable) { const { manualReplyFailed } = require('./whatsappNotificationTrigger.service'); await manualReplyFailed(claimed); await incidentService.createOrIncrement({type:'RESPUESTA_MANUAL_FALLIDA',severity:'ERROR',entityType:'RESPUESTA_RECEPCION',entityId:claimed.id,replyId:claimed.id,referralId:claimed.derivacion_id,code:error.code,summary:error.summary,category:error.category,recoverable:false,attempts:claimed.intentos,idempotencyKey:`manual-failed:${claimed.id}:${error.code}:${claimed.intentos}`}).catch(()=>console.error('[WhatsApp Monitoring] Error procesando monitoreo')); } }
  return dto(claimed);
};
const cancel = async ({ id, replyId, user, replyModel = WhatsappReceptionReply }) => { const reply = await replyModel.findOne({ where: { id: replyId, derivacion_id: id } }); if (!reply) throw fail('Vista previa no encontrada.', 404); if (Number(reply.usuario_id) !== Number(user.id) && user.rol !== 'admin') throw fail('Acción no autorizada.', 403); if (reply.estado !== 'PENDIENTE_CONFIRMACION') throw fail('La vista previa ya no se puede cancelar.', 409); await reply.update({ estado: 'CANCELADO' }); return dto(reply); };

module.exports = { sanitizeText, authorize, windowStatus, dto, configuration, preview, list, confirm, cancel };
