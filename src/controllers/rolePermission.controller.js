const service = require('../services/rolePermission.service');

const getAll = async (req, res, next) => { try { res.json({ admin: await service.effectivePermissions('admin'), personal: await service.effectivePermissions('personal') }); } catch (error) { next(error); } };
const update = async (req, res, next) => { try { const permissions = await service.savePermissions(req.params.role, req.body?.permissions, req.user.id); res.json({ message: 'Permisos actualizados correctamente.', role: req.params.role, permissions }); } catch (error) { next(error); } };
const mine = async (req, res, next) => { try { res.json({ role: req.user.rol, permissions: await service.effectivePermissions(req.user.rol) }); } catch (error) { next(error); } };

module.exports = { getAll, update, mine };
