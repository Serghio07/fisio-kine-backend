const { Paciente, Sesion } = require('../models');

const includePaciente = [{ model: Paciente, as: 'paciente' }];

const normalizarSesion = (body) => {
  const asistencia = body.asistencia || 'pendiente';
  const sesionesHizo = Number(body.sesiones_hizo || 0);

  return {
    paciente_id: body.paciente_id,
    fecha: body.fecha,
    sesiones_debe: Number(body.sesiones_debe || 0),
    sesiones_hizo: sesionesHizo,
    numero_sesion: body.numero_sesion || Math.max(sesionesHizo, 1),
    asistencia,
    metodo_pago: body.metodo_pago || 'Pendiente',
    observacion: body.observacion
  };
};

const validarSesion = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.fecha) return 'fecha es requerida';
  if (Number(body.sesiones_debe || 0) < 0) return 'sesiones_debe no puede ser negativo';
  if (Number(body.sesiones_hizo || 0) < 0) return 'sesiones_hizo no puede ser negativo';
  if (!['pendiente', 'asistio', 'no_asistio', 'cancelada', 'reprogramada'].includes(body.asistencia || 'pendiente')) {
    return 'asistencia no es valida';
  }
  if (!['QR', 'Efectivo', 'Transferencia', 'Pendiente'].includes(body.metodo_pago || 'Pendiente')) {
    return 'metodo_pago no es valido';
  }
  return null;
};

const listarSesiones = async (req, res, next) => {
  try {
    const sesiones = await Sesion.findAll({ include: includePaciente, order: [['fecha', 'DESC'], ['id', 'DESC']] });
    return res.json(sesiones);
  } catch (error) {
    return next(error);
  }
};

const obtenerSesion = async (req, res, next) => {
  try {
    const sesion = await Sesion.findByPk(req.params.id, { include: includePaciente });
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });
    return res.json(sesion);
  } catch (error) {
    return next(error);
  }
};

const crearSesion = async (req, res, next) => {
  try {
    const errorValidacion = validarSesion(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const payload = normalizarSesion(req.body);
    if (payload.asistencia === 'asistio' && payload.sesiones_hizo === 0) {
      payload.sesiones_hizo = 1;
      payload.numero_sesion = 1;
    }

    const sesion = await Sesion.create(payload);
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includePaciente });
    return res.status(201).json(sesionCompleta);
  } catch (error) {
    return next(error);
  }
};

const actualizarSesion = async (req, res, next) => {
  try {
    const sesion = await Sesion.findByPk(req.params.id);
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });

    const payload = normalizarSesion({ ...sesion.toJSON(), ...req.body });
    const errorValidacion = validarSesion(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    await sesion.update(payload);
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includePaciente });
    return res.json(sesionCompleta);
  } catch (error) {
    return next(error);
  }
};

const eliminarSesion = async (req, res, next) => {
  try {
    const sesion = await Sesion.findByPk(req.params.id);
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });

    await sesion.destroy();
    return res.json({ message: 'Sesion eliminada correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarSesiones,
  obtenerSesion,
  crearSesion,
  actualizarSesion,
  eliminarSesion
};
