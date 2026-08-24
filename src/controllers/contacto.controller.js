const contactoService = require('../services/contacto.service');
const relationService = require('../services/pacienteContacto.service');

exports.listar = async (req, res, next) => { try { return res.json(await contactoService.list(req.query)); } catch (error) { return next(error); } };
exports.obtener = async (req, res, next) => { try { const item = await contactoService.get(req.params.id); return item ? res.json(item) : res.status(404).json({ message: 'Contacto no encontrado.' }); } catch (error) { return next(error); } };
exports.crear = async (req, res, next) => { try { const item = await contactoService.create({ body: req.body, userId: req.usuario.id }); return res.status(201).json(contactoService.contactDto(item)); } catch (error) { return next(error); } };
exports.actualizar = async (req, res, next) => { try { const item = await contactoService.update({ id: req.params.id, body: req.body, userId: req.usuario.id }); return res.json(contactoService.contactDto(item)); } catch (error) { return next(error); } };
exports.desactivar = async (req, res, next) => { try { const item = await contactoService.deactivate({ id: req.params.id, userId: req.usuario.id }); return res.json(contactoService.contactDto(item)); } catch (error) { return next(error); } };
exports.reactivar = async (req, res, next) => { try { const item = await contactoService.activate({ id: req.params.id, userId: req.usuario.id }); return res.json(contactoService.contactDto(item)); } catch (error) { return next(error); } };
exports.listarPacientes = async (req, res, next) => { try { return res.json(await relationService.listByContact(req.params.id, String(req.query.incluir_historial).toLowerCase() === 'true')); } catch (error) { return next(error); } };
