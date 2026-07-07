const { Op } = require('sequelize');
const { Cita, ESTADOS_CITA, Paciente, Personal, TIPOS_ATENCION, Usuario } = require('../models');

const includeCita = [
  { model: Paciente, as: 'paciente' },
  {
    model: Usuario,
    as: 'registrado_por',
    attributes: ['id', 'nombre', 'usuario', 'rol', 'foto'],
    include: [{
      model: Personal,
      as: 'ficha_personal',
      attributes: ['titulo_profesional', 'cargo', 'nombres', 'apellido_paterno', 'apellido_materno']
    }]
  }
];

const normalizarHora = (value) => {
  if (!value) return value;
  return String(value).slice(0, 5);
};

const normalizarCita = (body) => ({
  paciente_id: body.paciente_id,
  fecha: body.fecha,
  hora_inicio: normalizarHora(body.hora_inicio),
  hora_fin: normalizarHora(body.hora_fin),
  motivo: body.motivo,
  tipo_atencion: body.tipo_atencion || 'Sesion de fisioterapia',
  estado: body.estado || 'Pendiente',
  observacion: body.observacion
});

const validarCita = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.fecha) return 'fecha es requerida';
  if (!body.hora_inicio) return 'hora_inicio es requerida';
  if (body.hora_fin && body.hora_fin <= body.hora_inicio) return 'hora_fin debe ser mayor que hora_inicio';
  if (!ESTADOS_CITA.includes(body.estado || 'Pendiente')) return 'estado no es valido';
  if (body.tipo_atencion && !TIPOS_ATENCION.includes(body.tipo_atencion)) return 'tipo_atencion no es valido';
  return null;
};

const validarSolapamiento = async (payload, citaId = null) => {
  if (payload.estado === 'Cancelada') return null;

  const inicio = payload.hora_inicio;
  if (!payload.hora_fin) {
    const where = {
      fecha: payload.fecha,
      hora_inicio: inicio,
      estado: { [Op.ne]: 'Cancelada' }
    };
    if (citaId) where.id = { [Op.ne]: citaId };
    const citaExistente = await Cita.findOne({ where });
    return citaExistente ? 'Ya existe una cita activa en ese horario' : null;
  }

  const fin = payload.hora_fin;
  const where = {
    fecha: payload.fecha,
    estado: { [Op.ne]: 'Cancelada' },
    [Op.and]: [
      { hora_inicio: { [Op.lt]: fin } },
      { [Op.or]: [{ hora_fin: { [Op.gt]: inicio } }, { hora_fin: null, hora_inicio: { [Op.gte]: inicio, [Op.lt]: fin } }] }
    ]
  };

  if (citaId) where.id = { [Op.ne]: citaId };

  const citaExistente = await Cita.findOne({ where });
  return citaExistente ? 'Ya existe una cita activa en ese rango de horario' : null;
};

const buildFiltros = (query = {}) => {
  const where = {};
  if (query.fecha) where.fecha = query.fecha;
  if (query.estado) where.estado = query.estado;
  if (query.tipo_atencion) where.tipo_atencion = query.tipo_atencion;
  if (query.fecha_inicio || query.fecha_fin) {
    where.fecha = {};
    if (query.fecha_inicio) where.fecha[Op.gte] = query.fecha_inicio;
    if (query.fecha_fin) where.fecha[Op.lte] = query.fecha_fin;
  }
  return where;
};

const listarCitas = async (req, res, next) => {
  try {
    const citas = await Cita.findAll({
      where: buildFiltros(req.query),
      include: includeCita,
      order: [['fecha', 'DESC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const obtenerCita = async (req, res, next) => {
  try {
    const cita = await Cita.findByPk(req.params.id, { include: includeCita });
    if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });
    return res.json(cita);
  } catch (error) {
    return next(error);
  }
};

const crearCita = async (req, res, next) => {
  try {
    const payload = normalizarCita(req.body);
    const errorValidacion = validarCita(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(payload.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const errorSolapamiento = await validarSolapamiento(payload);
    if (errorSolapamiento) return res.status(409).json({ message: errorSolapamiento });

    const cita = await Cita.create({ ...payload, usuario_id: req.usuario.id });
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.status(201).json(citaCompleta);
  } catch (error) {
    return next(error);
  }
};

const actualizarCita = async (req, res, next) => {
  try {
    const cita = await Cita.findByPk(req.params.id);
    if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });

    const payload = normalizarCita({ ...cita.toJSON(), ...req.body });
    const errorValidacion = validarCita(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(payload.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const errorSolapamiento = await validarSolapamiento(payload, cita.id);
    if (errorSolapamiento) return res.status(409).json({ message: errorSolapamiento });

    await cita.update(payload);
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.json(citaCompleta);
  } catch (error) {
    return next(error);
  }
};

const eliminarCita = async (req, res, next) => {
  try {
    const cita = await Cita.findByPk(req.params.id);
    if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });

    await cita.destroy();
    return res.json({ message: 'Cita eliminada correctamente' });
  } catch (error) {
    return next(error);
  }
};

const cambiarEstadoCita = async (req, res, next) => {
  try {
    const cita = await Cita.findByPk(req.params.id);
    if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });
    if (!ESTADOS_CITA.includes(req.body.estado)) return res.status(400).json({ message: 'estado no es valido' });

    await cita.update({ estado: req.body.estado });
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.json(citaCompleta);
  } catch (error) {
    return next(error);
  }
};

const listarCitasPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const citas = await Cita.findAll({
      where: { paciente_id: req.params.id },
      include: includeCita,
      order: [['fecha', 'DESC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const listarCalendario = async (req, res, next) => {
  try {
    const citas = await Cita.findAll({
      where: buildFiltros(req.query),
      include: includeCita,
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const listarPeriodo = (tipo) => async (req, res, next) => {
  try {
    const hoy = new Date();
    const inicio = new Date(hoy);
    const fin = new Date(hoy);

    if (tipo === 'semana') {
      const dia = hoy.getDay() || 7;
      inicio.setDate(hoy.getDate() - dia + 1);
      fin.setDate(inicio.getDate() + 6);
    }

    if (tipo === 'mes') {
      inicio.setDate(1);
      fin.setMonth(inicio.getMonth() + 1, 0);
    }

    const fechaInicio = inicio.toISOString().slice(0, 10);
    const fechaFin = fin.toISOString().slice(0, 10);
    const citas = await Cita.findAll({
      where: { fecha: { [Op.between]: [fechaInicio, fechaFin] } },
      include: includeCita,
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarCitas,
  obtenerCita,
  crearCita,
  actualizarCita,
  eliminarCita,
  cambiarEstadoCita,
  listarCitasPaciente,
  listarCalendario,
  listarCitasHoy: listarPeriodo('hoy'),
  listarCitasSemana: listarPeriodo('semana'),
  listarCitasMes: listarPeriodo('mes')
};
