const service = require('../services/movimientoCaja.service');

exports.listar = async (req, res, next) => { try { res.json(await service.listar(req.query)); } catch (error) { next(error); } };
exports.resumen = async (req, res, next) => { try { res.json(await service.resumen(req.query)); } catch (error) { next(error); } };
exports.saldo = async (req, res, next) => { try { res.json(await service.calcularSaldoCaja(req.query.fecha)); } catch (error) { next(error); } };
exports.obtener = async (req, res, next) => { try { res.json(await service.obtener(req.params.id)); } catch (error) { next(error); } };
exports.crear = async (req, res, next) => { try { res.status(201).json({ message: 'Movimiento de caja registrado correctamente.', movimiento: await service.crear(req.body, req.usuario.id) }); } catch (error) { next(error); } };
exports.anular = async (req, res, next) => { try { res.json({ message: 'Movimiento de caja anulado correctamente.', movimiento: await service.anular(req.params.id, req.body.motivo, req.usuario.id) }); } catch (error) { next(error); } };
