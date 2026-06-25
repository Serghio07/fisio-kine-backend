const { Op } = require('sequelize');
const { Personal, Usuario } = require('../models');

const includeUsuario = [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'usuario', 'email', 'estado'] }];
const estados = ['activo', 'inactivo'];
const tiposPago = ['mensual', 'por_servicio'];

const limpiar = (value) => (typeof value === 'string' ? value.trim() : value);

const normalizar = (body) => ({
  usuario_id: body.usuario_id || null,
  apellido_paterno: limpiar(body.apellido_paterno),
  apellido_materno: limpiar(body.apellido_materno) || null,
  nombres: limpiar(body.nombres),
  ci: limpiar(body.ci),
  cargo: limpiar(body.cargo),
  dias_trabajo: Array.isArray(body.dias_trabajo) ? body.dias_trabajo : [],
  hora_entrada: body.hora_entrada || null,
  hora_salida: body.hora_salida || null,
  sueldo_base: body.tipo_pago === 'por_servicio' ? null : body.sueldo_base,
  tipo_pago: body.tipo_pago || 'mensual',
  telefono: limpiar(body.telefono) || null,
  direccion: limpiar(body.direccion) || null,
  fecha_ingreso: body.fecha_ingreso,
  estado: body.estado || 'activo',
  observaciones: limpiar(body.observaciones) || null
});

const validar = (data) => {
  if (!data.apellido_paterno || !data.nombres || !data.ci || !data.cargo || !data.fecha_ingreso) {
    return 'Apellido paterno, nombres, cedula, cargo y fecha de ingreso son obligatorios.';
  }
  if (!estados.includes(data.estado)) return 'Estado no valido.';
  if (!tiposPago.includes(data.tipo_pago)) return 'Tipo de pago no valido.';
  if (data.tipo_pago === 'mensual' && !(Number(data.sueldo_base) >= 0)) return 'Registra un sueldo base valido.';
  if (!data.dias_trabajo.length || !data.hora_entrada || !data.hora_salida) {
    return 'Selecciona los dias de trabajo y registra la hora de entrada y salida.';
  }
  if (data.hora_entrada && data.hora_salida && data.hora_salida <= data.hora_entrada) {
    return 'La hora de salida debe ser posterior a la hora de entrada.';
  }
  return null;
};

const listarPersonal = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.cargo) where.cargo = req.query.cargo;
    if (req.query.buscar) {
      where[Op.or] = [
        { nombres: { [Op.iLike]: `%${req.query.buscar}%` } },
        { apellido_paterno: { [Op.iLike]: `%${req.query.buscar}%` } },
        { apellido_materno: { [Op.iLike]: `%${req.query.buscar}%` } },
        { ci: { [Op.iLike]: `%${req.query.buscar}%` } },
        { cargo: { [Op.iLike]: `%${req.query.buscar}%` } }
      ];
    }
    const personal = await Personal.findAll({
      where,
      include: includeUsuario,
      order: [['apellido_paterno', 'ASC'], ['apellido_materno', 'ASC'], ['nombres', 'ASC']]
    });
    return res.json(personal);
  } catch (error) {
    return next(error);
  }
};

const obtenerPersonal = async (req, res, next) => {
  try {
    const personal = await Personal.findByPk(req.params.id, { include: includeUsuario });
    if (!personal) return res.status(404).json({ message: 'Personal no encontrado.' });
    return res.json(personal);
  } catch (error) {
    return next(error);
  }
};

const crearPersonal = async (req, res, next) => {
  try {
    const payload = normalizar(req.body);
    const error = validar(payload);
    if (error) return res.status(400).json({ message: error });
    const personal = await Personal.create(payload);
    return res.status(201).json(await Personal.findByPk(personal.id, { include: includeUsuario }));
  } catch (error) {
    return next(error);
  }
};

const actualizarPersonal = async (req, res, next) => {
  try {
    const personal = await Personal.findByPk(req.params.id);
    if (!personal) return res.status(404).json({ message: 'Personal no encontrado.' });
    const payload = normalizar({ ...personal.toJSON(), ...req.body });
    const error = validar(payload);
    if (error) return res.status(400).json({ message: error });
    await personal.update(payload);
    if (personal.usuario_id) {
      await Usuario.update(
        { estado: payload.estado, activo: payload.estado === 'activo' },
        { where: { id: personal.usuario_id } }
      );
    }
    return res.json(await Personal.findByPk(personal.id, { include: includeUsuario }));
  } catch (error) {
    return next(error);
  }
};

const cambiarEstadoPersonal = async (req, res, next) => {
  try {
    if (!estados.includes(req.body.estado)) return res.status(400).json({ message: 'Estado no valido.' });
    const personal = await Personal.findByPk(req.params.id);
    if (!personal) return res.status(404).json({ message: 'Personal no encontrado.' });
    await personal.update({ estado: req.body.estado });
    if (personal.usuario_id) {
      await Usuario.update(
        { estado: req.body.estado, activo: req.body.estado === 'activo' },
        { where: { id: personal.usuario_id } }
      );
    }
    return res.json(personal);
  } catch (error) {
    return next(error);
  }
};

module.exports = { listarPersonal, obtenerPersonal, crearPersonal, actualizarPersonal, cambiarEstadoPersonal };
