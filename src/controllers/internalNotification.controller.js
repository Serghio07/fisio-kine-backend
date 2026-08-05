const service = require('../services/internalNotification.service');
const safe = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); return next(error); } };
const listar = safe(async (req, res) => res.json(await service.list({ userId: req.user.id, query: req.query })));
const recientes = safe(async (req, res) => res.json(await service.recent({ userId: req.user.id, limit: req.query.limit })));
const resumen = safe(async (req, res) => res.json(await service.summary({ userId: req.user.id })));
const leer = safe(async (req, res) => res.json(await service.markRead({ id: req.params.id, userId: req.user.id })));
const leerTodas = safe(async (req, res) => res.json(await service.markAllRead({ userId: req.user.id })));
module.exports = { listar, recientes, resumen, leer, leerTodas };
