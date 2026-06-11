const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
  if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para esta accion' });
  }

  return next();
};

module.exports = autorizarRoles;
