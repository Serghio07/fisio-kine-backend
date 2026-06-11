const { Usuario } = require('../models');

const atributosPublicos = { exclude: ['password'] };

const listarUsuarios = async (req, res, next) => {
  try {
    const usuarios = await Usuario.findAll({ attributes: atributosPublicos, order: [['id', 'ASC']] });
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
    const { nombre, usuario, email, password, rol, estado } = req.body;

    if (!nombre || !usuario || !password) {
      return res.status(400).json({ message: 'nombre, usuario y password son requeridos' });
    }

    if (rol && !['admin', 'personal'].includes(rol)) {
      return res.status(400).json({ message: 'rol solo puede ser admin o personal' });
    }

    const nuevoUsuario = await Usuario.create({ nombre, usuario, email, password, rol, estado });
    return res.status(201).json(nuevoUsuario);
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

    await usuario.update(req.body);
    return res.json(usuario);
  } catch (error) {
    return next(error);
  }
};

const eliminarUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });

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
  eliminarUsuario
};
