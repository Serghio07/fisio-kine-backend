const { registrarAccesoDenegado } = require('./financialAccess.middleware');

const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
  const usuario = req.user || req.usuario;
  if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
    registrarAccesoDenegado(req, `Intentó ejecutar una operación permitida únicamente para: ${rolesPermitidos.join(', ')}.`);
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para esta acción.'
    });
  }

  return next();
};

module.exports = autorizarRoles;
