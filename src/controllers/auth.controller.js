const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { Usuario, Personal } = require('../models');
const { validarImagen } = require('../utils/imagen');
const { validarPasswordSegura } = require('../utils/password');

const MAX_INTENTOS_LOGIN = 5;
const MINUTOS_BLOQUEO = 15;
const normalizarIdentificador = (value = '') => String(value).trim().toLowerCase();

const login = async (req, res, next) => {
  try {
    const identificador = normalizarIdentificador(req.body.usuario);
    const { password } = req.body;

    if (!identificador || !password) {
      return res.status(400).json({ message: 'El usuario o correo y la contraseña son obligatorios.' });
    }

    const usuarioDb = await Usuario.findOne({
      where: {
        [Op.or]: [
          { usuario: { [Op.iLike]: identificador } },
          { email: { [Op.iLike]: identificador } }
        ]
      },
      include: [{ model: Personal, as: 'ficha_personal' }]
    });
    if (!usuarioDb) {
      return res.status(401).json({ message: 'Credenciales incorrectas.' });
    }

    if (usuarioDb.estado === 'pendiente') {
      return res.status(403).json({ message: 'Tu cuenta está pendiente de aprobación por el administrador.' });
    }
    if (usuarioDb.estado === 'bloqueado') {
      return res.status(403).json({ message: 'Tu cuenta ha sido bloqueada. Comunícate con el administrador.' });
    }
    if (usuarioDb.estado === 'rechazado') {
      return res.status(403).json({ message: 'Tu solicitud de acceso fue rechazada. Comunícate con el administrador.' });
    }
    if (usuarioDb.estado !== 'activo' || usuarioDb.activo === false) {
      return res.status(403).json({ message: 'Tu cuenta no está habilitada. Comunícate con el administrador.' });
    }

    const ahora = new Date();
    if (usuarioDb.bloqueado_hasta && new Date(usuarioDb.bloqueado_hasta) > ahora) {
      return res.status(429).json({
        message: 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.'
      });
    }
    if (usuarioDb.bloqueado_hasta) {
      await usuarioDb.update({ bloqueado_hasta: null, intentos_fallidos: 0 });
    }

    const passwordValido = await usuarioDb.validarPassword(password);
    if (!passwordValido) {
      const intentos = (usuarioDb.intentos_fallidos || 0) + 1;
      const bloqueoTemporal = intentos >= MAX_INTENTOS_LOGIN
        ? new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000)
        : null;
      await usuarioDb.update({
        intentos_fallidos: bloqueoTemporal ? 0 : intentos,
        bloqueado_hasta: bloqueoTemporal
      });

      if (bloqueoTemporal) {
        return res.status(429).json({
          message: `Demasiados intentos fallidos. El acceso se bloqueó temporalmente por ${MINUTOS_BLOQUEO} minutos.`
        });
      }
      return res.status(401).json({ message: 'Credenciales incorrectas.' });
    }

    usuarioDb.ultimo_acceso = new Date();
    usuarioDb.intentos_fallidos = 0;
    usuarioDb.bloqueado_hasta = null;
    await usuarioDb.save();

    const token = jwt.sign(
      { id: usuarioDb.id, usuario: usuarioDb.usuario, rol: usuarioDb.rol, estado: usuarioDb.estado },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '2h', algorithm: 'HS256' }
    );

    res.cookie('physio_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 2 * 60 * 60 * 1000,
      path: '/'
    });
    const usuarioSeguro = usuarioDb.toJSON();
    delete usuarioSeguro.password;
    return res.json({ message: 'Inicio de sesión exitoso.', usuario: usuarioSeguro });
  } catch (error) {
    return next(error);
  }
};

const solicitarAcceso = async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const usuario = normalizarIdentificador(req.body.usuario);
    const email = normalizarIdentificador(req.body.email);
    const telefono = String(req.body.telefono || '').trim() || null;
    const foto = req.body.foto || null;
    const { password } = req.body;

    if (!nombre || !usuario || !email || !password) {
      return res.status(400).json({ message: 'Nombre, usuario, correo electrónico y contraseña son obligatorios.' });
    }
    const errorPassword = validarPasswordSegura(password);
    if (errorPassword) return res.status(400).json({ message: errorPassword });
    const errorImagen = validarImagen(foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    const existente = await Usuario.findOne({
      where: {
        [Op.or]: [
          { usuario: { [Op.iLike]: usuario } },
          { email: { [Op.iLike]: email } }
        ]
      }
    });
    if (existente) {
      const campo = existente.usuario === usuario ? 'usuario' : 'correo electrónico';
      return res.status(409).json({ message: `El ${campo} ya está registrado.` });
    }

    const nuevoUsuario = await Usuario.create({
      nombre,
      usuario,
      email,
      telefono,
      foto,
      password,
      rol: 'personal',
      estado: 'pendiente',
      activo: false,
      intentos_fallidos: 0
    });

    return res.status(201).json({
      message: 'Solicitud enviada correctamente. El administrador revisará tu cuenta antes de habilitar el acceso.',
      usuario: nuevoUsuario
    });
  } catch (error) {
    return next(error);
  }
};

const logout = (req, res) => {
  res.clearCookie('physio_session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  });
  return res.json({ message: 'Sesión cerrada correctamente.' });
};

module.exports = { login, logout, solicitarAcceso };
