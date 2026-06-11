const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
  const usuario = req.user || req.usuario;
  if (!usuario || !rolesPermitidos.includes(usuario.rol)) {
    return res.status(403).json({ message: 'No tienes permisos para esta accion' });
  }

  return next();
};

module.exports = autorizarRoles;
