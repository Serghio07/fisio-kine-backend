const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const login = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ message: 'usuario y password son requeridos' });
    }

    const usuarioDb = await Usuario.findOne({ where: { usuario } });
    if (!usuarioDb || !usuarioDb.estado) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    const passwordValido = await usuarioDb.validarPassword(password);
    if (!passwordValido) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    usuarioDb.ultimo_acceso = new Date();
    await usuarioDb.save();

    const token = jwt.sign(
      { id: usuarioDb.id, rol: usuarioDb.rol },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({ token, usuario: usuarioDb });
  } catch (error) {
    return next(error);
  }
};

module.exports = { login };
