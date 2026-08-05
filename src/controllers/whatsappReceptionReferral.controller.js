const sequelize = require('../config/database');
const service = require('../services/receptionReferralManagement.service');
const replies = require('../services/whatsappReceptionReply.service');

const safe = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message, estado_actual: error.currentState }); return next(error); } };
const listar = safe(async (req, res) => res.json(await service.list({ query: req.query })));
const resumen = safe(async (req, res) => res.json(await service.summary()));
const detalle = safe(async (req, res) => { const item = await service.get(req.params.id); return item ? res.json(item) : res.status(404).json({ message: 'Derivación no encontrada.' }); });
const action = (name, field) => safe(async (req, res) => { const item = await service.mutate({ id: req.params.id, user: req.user, action: name, value: field ? req.body?.[field] : null, db: sequelize }); return res.json(await service.get(item.id)); });

const configuracionRespuestas = safe(async (req, res) => res.json(await replies.configuration({ id: req.params.id, user: req.user })));
const listarRespuestas = safe(async (req, res) => res.json(await replies.list({ id: req.params.id, user: req.user })));
const previsualizarRespuesta = safe(async (req, res) => res.status(201).json(await replies.preview({ id: req.params.id, user: req.user, body: req.body })));
const confirmarRespuesta = safe(async (req, res) => res.json(await replies.confirm({ id: req.params.id, replyId: req.params.respuestaId, user: req.user })));
const reintentarRespuesta = safe(async (req, res) => res.json(await replies.confirm({ id: req.params.id, replyId: req.params.respuestaId, user: req.user, retry: true })));
const cancelarRespuesta = safe(async (req, res) => res.json(await replies.cancel({ id: req.params.id, replyId: req.params.respuestaId, user: req.user })));
module.exports = { listar, resumen, detalle, tomar: action('TOMADA'), prioridad: action('PRIORIDAD', 'prioridad'), observar: action('OBSERVACION', 'observacion'), resolver: action('RESUELTA', 'resolucion'), cerrar: action('CERRADA'), configuracionRespuestas, listarRespuestas, previsualizarRespuesta, confirmarRespuesta, reintentarRespuesta, cancelarRespuesta };
