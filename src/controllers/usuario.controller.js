const { Usuario } = require('../models');
const { Op } = require('sequelize');

const atributosPublicos = { exclude: ['password'] };
const limpiarTexto = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizarEstado = (estado = 'activo') => {
  if (estado === true) return 'activo';
  if (estado === false) return 'inactivo';
  return estado || 'activo';
};
const estadosPermitidos = ['activo', 'inactivo', 'bloqueado'];

const listarUsuarios = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.rol) where.rol = req.query.rol;
    if (req.query.estado) where.estado = normalizarEstado(req.query.estado);
    if (req.query.buscar) {
      where[Op.or] = [
        { nombre: { [Op.iLike]: `%${req.query.buscar}%` } },
        { usuario: { [Op.iLike]: `%${req.query.buscar}%` } },
        { email: { [Op.iLike]: `%${req.query.buscar}%` } }
      ];
    }

    const usuarios = await Usuario.findAll({ where, attributes: atributosPublicos, order: [['id', 'ASC']] });
    return res.json(usuarios);
  } catch (error) {
    return next(error);
  }
};

const obtenerUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id, { attributes: atributosPublicos });
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json(usuario);
  } catch (error) {
    return next(error);
  }
};

const crearUsuario = async (req, res, next) => {
  try {
    const nombre = limpiarTexto(req.body.nombre);
    const usuario = limpiarTexto(req.body.usuario);
    const email = limpiarTexto(req.body.email) || null;
    const password = limpiarTexto(req.body.password || req.body.contrasena);
    const rol = limpiarTexto(req.body.rol) || 'personal';
    const estado = normalizarEstado(req.body.estado);

    if (!nombre || !usuario || !password) {
      return res.status(400).json({ message: 'nombre, usuario y password son requeridos' });
    }

    if (rol && !['admin', 'personal'].includes(rol)) {
      return res.status(400).json({ message: 'rol solo puede ser admin o personal' });
    }

    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ message: 'estado solo puede ser activo, inactivo o bloqueado' });
    }

    const existente = await Usuario.findOne({ where: { usuario } });
    if (existente) {
      return res.status(409).json({ message: 'El usuario ya existe' });
    }

    if (email) {
      const emailExistente = await Usuario.findOne({ where: { email } });
      if (emailExistente) return res.status(409).json({ message: 'El email ya esta registrado' });
    }

    const nuevoUsuario = await Usuario.create({ nombre, usuario, email, password, rol, estado, intentos_fallidos: 0 });
    return res.status(201).json({ message: 'Usuario creado correctamente', usuario: nuevoUsuario });
  } catch (error) {
    return next(error);
  }
};

const actualizarUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (req.body.rol && !['admin', 'personal'].includes(req.body.rol)) {
      return res.status(400).json({ message: 'rol solo puede ser admin o personal' });
    }

    const payload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(payload, 'nombre')) payload.nombre = limpiarTexto(payload.nombre);
    if (Object.prototype.hasOwnProperty.call(payload, 'usuario')) payload.usuario = limpiarTexto(payload.usuario);
    if (Object.prototype.hasOwnProperty.call(payload, 'email')) payload.email = limpiarTexto(payload.email) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'password')) payload.password = limpiarTexto(payload.password);
    if (Object.prototype.hasOwnProperty.call(payload, 'rol')) payload.rol = limpiarTexto(payload.rol);

    if (payload.email) {
      const emailExistente = await Usuario.findOne({ where: { email: payload.email, id: { [Op.ne]: usuario.id } } });
      if (emailExistente) return res.status(409).json({ message: 'El email ya esta registrado' });
    }

    if (payload.usuario) {
      const usuarioExistente = await Usuario.findOne({ where: { usuario: payload.usuario, id: { [Op.ne]: usuario.id } } });
      if (usuarioExistente) return res.status(409).json({ message: 'El usuario ya existe' });
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'estado')) {
      payload.estado = normalizarEstado(payload.estado);
      if (!estadosPermitidos.includes(payload.estado)) {
        return res.status(400).json({ message: 'estado solo puede ser activo, inactivo o bloqueado' });
      }

      if (String(req.user?.id) === String(usuario.id) && ['inactivo', 'bloqueado'].includes(payload.estado)) {
        return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propio usuario' });
      }

      if (payload.estado === 'activo') {
        payload.intentos_fallidos = 0;
      }
    }

    await usuario.update(payload);
    return res.json({ message: 'Usuario actualizado correctamente', usuario });
  } catch (error) {
    return next(error);
  }
};

const cambiarEstadoUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    const estado = normalizarEstado(req.body.estado);
    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ message: 'estado solo puede ser activo, inactivo o bloqueado' });
    }

    if (String(req.user?.id) === String(usuario.id) && ['inactivo', 'bloqueado'].includes(estado)) {
      return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propio usuario' });
    }

    await usuario.update({ estado, intentos_fallidos: estado === 'activo' ? 0 : usuario.intentos_fallidos });
    return res.json({ message: estado === 'activo' ? 'Usuario desbloqueado correctamente' : 'Estado actualizado correctamente', usuario });
  } catch (error) {
    return next(error);
  }
};

const eliminarUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

    if (String(req.user?.id) === String(usuario.id)) {
      return res.status(400).json({ message: 'No puedes eliminar tu propio usuario' });
    }

    await usuario.destroy();
    return res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario
};
