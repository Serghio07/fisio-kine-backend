const { effectivePermissions } = require('../services/rolePermission.service');
const { registrarAccesoDenegado } = require('./financialAccess.middleware');

const actionForRequest = (req) => {
  if (req.method === 'GET' || req.method === 'HEAD') return /export|descargar|imprimir/i.test(req.path) ? 'export' : 'view';
  if (req.method === 'DELETE' || /anular|eliminar|desactivar/i.test(req.path)) return 'annul';
  if (req.method === 'POST') return 'create';
  return 'edit';
};

const authorizeModule = (module) => async (req, res, next) => {
  try {
    if (req.user?.rol === 'admin') return next();
    const action = actionForRequest(req);
    const permissions = await effectivePermissions(req.user?.rol);
    if ((permissions[module] || []).includes(action)) return next();
    registrarAccesoDenegado(req, `Intentó ejecutar ${action} en el módulo ${module}.`);
    return res.status(403).json({ message: 'No tienes permiso para realizar esta acción.' });
  } catch (error) { return next(error); }
};

module.exports = { authorizeModule, actionForRequest };
