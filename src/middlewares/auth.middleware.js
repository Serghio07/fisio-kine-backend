const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const autenticar = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token no proporcionado' });
    }

    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    const usuario = await Usuario.findByPk(payload.id);

    if (!usuario || !usuario.estado) {
      return res.status(401).json({ message: 'Usuario no autorizado' });
    }

    req.usuario = usuario;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido o expirado' });
  }
};

module.exports = autenticar;
