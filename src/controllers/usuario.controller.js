const { Personal, Usuario, sequelize } = require('../models');
const { Op } = require('sequelize');
const { validarImagen } = require('../utils/imagen');
const { validarPasswordSegura } = require('../utils/password');

const atributosPublicos = { exclude: ['password'] };
const limpiarTexto = (value) => (typeof value === 'string' ? value.trim() : value);
const normalizarEstado = (estado = 'activo') => {
  if (estado === true) return 'activo';
  if (estado === false) return 'inactivo';
  return estado || 'activo';
};
const estadosPermitidos = ['pendiente', 'activo', 'inactivo', 'bloqueado', 'rechazado'];
const includeFichaPersonal = [{ model: Personal, as: 'ficha_personal' }];
const camposLaborales = [
  'apellido_paterno', 'apellido_materno', 'nombres', 'ci', 'titulo_profesional', 'cargo', 'dias_trabajo',
  'hora_entrada', 'hora_salida', 'sueldo_base', 'tipo_pago', 'direccion',
  'fecha_ingreso', 'observaciones'
];
const datosLaborales = (body, estadoUsuario = 'activo') => ({
  apellido_paterno: limpiarTexto(body.apellido_paterno),
  apellido_materno: limpiarTexto(body.apellido_materno) || null,
  nombres: limpiarTexto(body.nombres),
  ci: limpiarTexto(body.ci),
  titulo_profesional: limpiarTexto(body.titulo_profesional) || null,
  cargo: limpiarTexto(body.cargo),
  dias_trabajo: Array.isArray(body.dias_trabajo) ? body.dias_trabajo : [],
  hora_entrada: body.hora_entrada || null,
  hora_salida: body.hora_salida || null,
  sueldo_base: body.tipo_pago === 'por_servicio' ? null : body.sueldo_base,
  tipo_pago: body.tipo_pago || 'mensual',
  telefono: limpiarTexto(body.telefono) || null,
  direccion: limpiarTexto(body.direccion) || null,
  fecha_ingreso: body.fecha_ingreso,
  estado: estadoUsuario === 'activo' ? 'activo' : 'inactivo',
  observaciones: limpiarTexto(body.observaciones) || null
});
const validarDatosLaborales = (data) => {
  if (!data.apellido_paterno || !data.nombres || !data.ci || !data.cargo || !data.fecha_ingreso) {
    return 'Apellido paterno, nombres, cedula, cargo y fecha de ingreso son obligatorios.';
  }
  if (!data.dias_trabajo.length || !data.hora_entrada || !data.hora_salida) {
    return 'Selecciona los dias de trabajo y registra la hora de entrada y salida.';
  }
  if (data.titulo_profesional && !['Doc.', 'Dr.', 'Dra.', 'Lic.', 'Sr.', 'Sra.'].includes(data.titulo_profesional)) {
    return 'Titulo profesional no valido.';
  }
  if (data.hora_salida <= data.hora_entrada) return 'La hora de salida debe ser posterior a la hora de entrada.';
  if (!['mensual', 'por_servicio'].includes(data.tipo_pago)) return 'Tipo de pago no valido.';
  if (data.tipo_pago === 'mensual' && !(Number(data.sueldo_base) >= 0)) return 'Registra un sueldo base valido.';
  return null;
};

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

    const usuarios = await Usuario.findAll({ where, attributes: atributosPublicos, include: includeFichaPersonal, order: [['id', 'ASC']] });
    return res.json(usuarios);
  } catch (error) {
    return next(error);
  }
};

const obtenerUsuario = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id, { attributes: atributosPublicos, include: includeFichaPersonal });
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    return res.json(usuario);
  } catch (error) {
    return next(error);
  }
};

const listarProfesionalesActivos = async (req, res, next) => {
  try {
    const profesionales = await Usuario.findAll({
      where: { estado: 'activo', activo: true },
      attributes: ['id', 'nombre', 'usuario', 'rol', 'foto'],
      include: includeFichaPersonal,
      order: [['rol', 'ASC'], ['nombre', 'ASC']]
    });
    return res.json(profesionales.map((profesional) => {
      const data = profesional.toJSON();
      return {
        ...data,
        nombre_mostrado: data.ficha_personal?.nombre_mostrado || data.nombre
      };
    }));
  } catch (error) {
    return next(error);
  }
};

const crearUsuarioAnterior = async (req, res, next) => {
  try {
    const nombre = limpiarTexto(req.body.nombre);
    const usuario = limpiarTexto(req.body.usuario);
    const email = limpiarTexto(req.body.email) || null;
    const telefono = limpiarTexto(req.body.telefono) || null;
    const foto = req.body.foto || null;
    const password = limpiarTexto(req.body.password || req.body.contrasena);
    const rol = 'personal';
    const estado = normalizarEstado(req.body.estado);

    if (!nombre || !usuario || !email || !password) {
      return res.status(400).json({
        message: 'Nombre, usuario, correo electrónico y contraseña son obligatorios.'
      });
    }
    const errorPassword = validarPasswordSegura(password);
    if (errorPassword) return res.status(400).json({ message: errorPassword });

    if (!estadosPermitidos.includes(estado)) {
      return res.status(400).json({ message: 'Estado de usuario no válido.' });
    }

    const errorImagen = validarImagen(foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    const existente = await Usuario.findOne({ where: { usuario } });
    if (existente) {
      return res.status(409).json({ message: 'El usuario ya está registrado.' });
    }

    if (email) {
      const emailExistente = await Usuario.findOne({ where: { email } });
      if (emailExistente) return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
    }

    const nuevoUsuario = await Usuario.create({
      nombre,
      usuario,
      email,
      telefono,
      foto,
      password,
      rol,
      estado,
      activo: estado === 'activo',
      intentos_fallidos: 0
    });
    return res.status(201).json({ message: 'Personal creado correctamente.', usuario: nuevoUsuario });
  } catch (error) {
    return next(error);
  }
};

const actualizarUsuarioAnterior = async (req, res, next) => {
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
    if (Object.prototype.hasOwnProperty.call(payload, 'telefono')) payload.telefono = limpiarTexto(payload.telefono) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'foto')) {
      payload.foto = payload.foto || null;
      const errorImagen = validarImagen(payload.foto);
      if (errorImagen) return res.status(400).json({ message: errorImagen });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
      payload.password = limpiarTexto(payload.password);
      const errorPassword = validarPasswordSegura(payload.password);
      if (errorPassword) return res.status(400).json({ message: errorPassword });
    }
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
        return res.status(400).json({ message: 'Estado de usuario no válido.' });
      }

      if (String(req.user?.id) === String(usuario.id) && ['inactivo', 'bloqueado'].includes(payload.estado)) {
        return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propio usuario' });
      }

      if (payload.estado === 'activo') {
        payload.intentos_fallidos = 0;
        payload.bloqueado_hasta = null;
      }
      payload.activo = payload.estado === 'activo';
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
      return res.status(400).json({ message: 'Estado de usuario no válido.' });
    }

    if (String(req.user?.id) === String(usuario.id) && ['inactivo', 'bloqueado'].includes(estado)) {
      return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propio usuario' });
    }

    await usuario.update({
      estado,
      activo: estado === 'activo',
      intentos_fallidos: estado === 'activo' ? 0 : usuario.intentos_fallidos,
      bloqueado_hasta: estado === 'activo' ? null : usuario.bloqueado_hasta
    });
    await Personal.update(
      { estado: estado === 'activo' ? 'activo' : 'inactivo' },
      { where: { usuario_id: usuario.id } }
    );
    return res.json({ message: estado === 'activo' ? 'Usuario desbloqueado correctamente' : 'Estado actualizado correctamente', usuario });
  } catch (error) {
    return next(error);
  }
};

const revisarSolicitud = async (req, res, next) => {
  try {
    const usuario = await Usuario.findByPk(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (!['pendiente', 'rechazado'].includes(usuario.estado)) {
      return res.status(400).json({ message: 'La cuenta no tiene una solicitud pendiente.' });
    }

    const decision = req.body.decision;
    if (!['aprobar', 'rechazar'].includes(decision)) {
      return res.status(400).json({ message: 'La decisión debe ser aprobar o rechazar.' });
    }

    const aprobado = decision === 'aprobar';
    await usuario.update({
      rol: 'personal',
      estado: aprobado ? 'activo' : 'rechazado',
      activo: aprobado,
      intentos_fallidos: 0,
      bloqueado_hasta: null
    });

    return res.json({
      message: aprobado
        ? 'Cuenta aprobada correctamente. El usuario ya puede iniciar sesión.'
        : 'Solicitud rechazada correctamente.',
      usuario
    });
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

const crearUsuario = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const estado = normalizarEstado(req.body.estado);
    const laboral = datosLaborales(req.body, estado);
    const errorLaboral = validarDatosLaborales(laboral);
    if (errorLaboral) {
      await transaction.rollback();
      return res.status(400).json({ message: errorLaboral });
    }

    const nombre = [laboral.nombres, laboral.apellido_paterno, laboral.apellido_materno].filter(Boolean).join(' ');
    const usuario = limpiarTexto(req.body.usuario);
    const email = limpiarTexto(req.body.email) || null;
    const telefono = limpiarTexto(req.body.telefono) || null;
    const foto = req.body.foto || null;
    const password = limpiarTexto(req.body.password || req.body.contrasena);

    if (!usuario || !email || !password) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Usuario, correo electronico y contrasena son obligatorios.' });
    }
    const errorPassword = validarPasswordSegura(password);
    if (errorPassword) {
      await transaction.rollback();
      return res.status(400).json({ message: errorPassword });
    }
    if (!estadosPermitidos.includes(estado)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Estado de usuario no valido.' });
    }
    const errorImagen = validarImagen(foto);
    if (errorImagen) {
      await transaction.rollback();
      return res.status(400).json({ message: errorImagen });
    }
    if (await Usuario.findOne({ where: { usuario }, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'El usuario ya esta registrado.' });
    }
    if (await Usuario.findOne({ where: { email }, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'El correo electronico ya esta registrado.' });
    }

    const nuevoUsuario = await Usuario.create({
      nombre,
      usuario,
      email,
      telefono,
      foto,
      password,
      rol: 'personal',
      estado,
      activo: estado === 'activo',
      intentos_fallidos: 0
    }, { transaction });
    await Personal.create({ ...laboral, usuario_id: nuevoUsuario.id }, { transaction });
    await transaction.commit();

    const completo = await Usuario.findByPk(nuevoUsuario.id, {
      attributes: atributosPublicos,
      include: includeFichaPersonal
    });
    return res.status(201).json({ message: 'Personal y cuenta creados correctamente.', usuario: completo });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const actualizarUsuario = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const usuario = await Usuario.findByPk(req.params.id, { transaction });
    if (!usuario) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const payload = { ...req.body };
    camposLaborales.forEach((campo) => delete payload[campo]);
    delete payload.ficha_personal;
    if (Object.prototype.hasOwnProperty.call(payload, 'usuario')) payload.usuario = limpiarTexto(payload.usuario);
    if (Object.prototype.hasOwnProperty.call(payload, 'email')) payload.email = limpiarTexto(payload.email) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'telefono')) payload.telefono = limpiarTexto(payload.telefono) || null;
    if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
      payload.password = limpiarTexto(payload.password);
      if (!payload.password) delete payload.password;
      else {
        const errorPassword = validarPasswordSegura(payload.password);
        if (errorPassword) {
          await transaction.rollback();
          return res.status(400).json({ message: errorPassword });
        }
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'foto')) {
      payload.foto = payload.foto || null;
      const errorImagen = validarImagen(payload.foto);
      if (errorImagen) {
        await transaction.rollback();
        return res.status(400).json({ message: errorImagen });
      }
    }
    if (payload.email && await Usuario.findOne({ where: { email: payload.email, id: { [Op.ne]: usuario.id } }, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'El email ya esta registrado' });
    }
    if (payload.usuario && await Usuario.findOne({ where: { usuario: payload.usuario, id: { [Op.ne]: usuario.id } }, transaction })) {
      await transaction.rollback();
      return res.status(409).json({ message: 'El usuario ya existe' });
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'estado')) {
      payload.estado = normalizarEstado(payload.estado);
      if (!estadosPermitidos.includes(payload.estado)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Estado de usuario no valido.' });
      }
      if (String(req.user?.id) === String(usuario.id) && ['inactivo', 'bloqueado'].includes(payload.estado)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propio usuario' });
      }
      payload.activo = payload.estado === 'activo';
      if (payload.estado === 'activo') {
        payload.intentos_fallidos = 0;
        payload.bloqueado_hasta = null;
      }
    }

    const incluyeDatosLaborales = camposLaborales.some((campo) =>
      Object.prototype.hasOwnProperty.call(req.body, campo)
    );
    if (incluyeDatosLaborales) {
      const laboral = datosLaborales(req.body, payload.estado || usuario.estado);
      const errorLaboral = validarDatosLaborales(laboral);
      if (errorLaboral) {
        await transaction.rollback();
        return res.status(400).json({ message: errorLaboral });
      }
      payload.nombre = [laboral.nombres, laboral.apellido_paterno, laboral.apellido_materno].filter(Boolean).join(' ');
      const ficha = await Personal.findOne({ where: { usuario_id: usuario.id }, transaction });
      if (ficha) await ficha.update(laboral, { transaction });
      else await Personal.create({ ...laboral, usuario_id: usuario.id }, { transaction });
    }

    await usuario.update(payload, { transaction });
    await transaction.commit();
    const completo = await Usuario.findByPk(usuario.id, {
      attributes: atributosPublicos,
      include: includeFichaPersonal
    });
    return res.json({ message: 'Usuario y datos laborales actualizados correctamente', usuario: completo });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

module.exports = {
  listarUsuarios,
  listarProfesionalesActivos,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  revisarSolicitud,
  eliminarUsuario
};
