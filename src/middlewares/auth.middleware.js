const jwt = require('jsonwebtoken');
const { Usuario, Personal } = require('../models');

const usuarioActivo = (usuario) => usuario.estado === 'activo' && usuario.activo !== false;
const obtenerCookie = (req, name) => {
  const entry = String(req.headers.cookie || '')
    .split(';')
    .find((cookie) => cookie.trim().startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.trim().slice(name.length + 1)) : null;
};

const autenticar = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    const token = header?.startsWith('Bearer ') ? header.slice(7) : obtenerCookie(req, 'physio_session');
    if (!token) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const usuario = await Usuario.findByPk(payload.id, {
      include: [{ model: Personal, as: 'ficha_personal' }]
    });

    if (!usuario || !usuarioActivo(usuario)) {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    req.usuario = usuario;
    req.user = {
      id: usuario.id,
      usuario: usuario.usuario,
      rol: usuario.rol,
      estado: usuario.estado
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
};

module.exports = autenticar;
