const jwt = require('jsonwebtoken');
const { Usuario } = require('../models');

const usuarioActivo = (usuario) => usuario.estado === true || usuario.estado === 'activo';
const MAX_INTENTOS_LOGIN = 5;

const login = async (req, res, next) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ message: 'usuario y password son requeridos' });
    }

    const usuarioDb = await Usuario.findOne({ where: { usuario } });
    if (!usuarioDb) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    if (usuarioDb.estado === 'bloqueado') {
      return res.status(403).json({ message: 'Usuario bloqueado por 5 intentos fallidos. Solicita desbloqueo al administrador.' });
    }

    if (!usuarioActivo(usuarioDb)) {
      return res.status(403).json({ message: 'Usuario inactivo' });
    }

    const passwordValido = await usuarioDb.validarPassword(password);
    if (!passwordValido) {
      const intentos = (usuarioDb.intentos_fallidos || 0) + 1;
      const bloqueado = intentos >= MAX_INTENTOS_LOGIN;

      await usuarioDb.update({
        intentos_fallidos: intentos,
        estado: bloqueado ? 'bloqueado' : usuarioDb.estado
      });

      if (bloqueado) {
        return res.status(403).json({ message: 'Usuario bloqueado por 5 intentos fallidos. Solicita desbloqueo al administrador.' });
      }

      return res.status(401).json({ message: `Credenciales invalidas. Intentos restantes: ${MAX_INTENTOS_LOGIN - intentos}` });
    }

    usuarioDb.ultimo_acceso = new Date();
    usuarioDb.intentos_fallidos = 0;
    await usuarioDb.save();

    const token = jwt.sign(
      { id: usuarioDb.id, usuario: usuarioDb.usuario, rol: usuarioDb.rol, estado: usuarioDb.estado },
      process.env.JWT_SECRET || 'dev_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({ message: 'Login exitoso', token, usuario: usuarioDb });
  } catch (error) {
    return next(error);
  }
};

const registrar = async (req, res, next) => {
  try {
    const { nombre, usuario, email, password } = req.body;

    if (!nombre || !usuario || !password) {
      return res.status(400).json({ message: 'nombre, usuario y password son requeridos' });
    }

    const existente = await Usuario.findOne({ where: { usuario } });
    if (existente) {
      return res.status(409).json({ message: 'El usuario ya existe' });
    }

    const nuevoUsuario = await Usuario.create({
      nombre,
      usuario,
      email,
      password,
      rol: 'personal',
      estado: 'activo'
    });

    return res.status(201).json({
      message: 'Usuario registrado correctamente',
      usuario: nuevoUsuario
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { login, registrar };
