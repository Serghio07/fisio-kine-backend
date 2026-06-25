const { Paciente, Sesion, Usuario, sequelize } = require('../models');
const { sincronizarSemana } = require('../services/sesionSemanalSync.service');

const includeSesion = [
  { model: Paciente, as: 'paciente' },
  { model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre', 'usuario', 'rol', 'foto'] }
];

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
    estado_pago: body.estado_pago || 'Pendiente',
    aplica_farmacos: Boolean(body.aplica_farmacos),
    observacion_farmacos: body.aplica_farmacos ? body.observacion_farmacos : null,
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
  if (!['Pagado', 'Pendiente', 'Parcial'].includes(body.estado_pago || 'Pendiente')) {
    return 'estado_pago no es válido';
  }
  return null;
};

const listarSesiones = async (req, res, next) => {
  try {
    const sesiones = await Sesion.findAll({ include: includeSesion, order: [['fecha', 'DESC'], ['id', 'DESC']] });
    return res.json(sesiones);
  } catch (error) {
    return next(error);
  }
};

const obtenerSesion = async (req, res, next) => {
  try {
    const sesion = await Sesion.findByPk(req.params.id, { include: includeSesion });
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });
    return res.json(sesion);
  } catch (error) {
    return next(error);
  }
};

const crearSesion = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const errorValidacion = validarSesion(req.body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    const paciente = await Paciente.findByPk(req.body.paciente_id, { transaction });
    if (!paciente) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const payload = normalizarSesion(req.body);
    if (payload.asistencia === 'asistio' && payload.sesiones_hizo === 0) {
      payload.sesiones_hizo = 1;
      payload.numero_sesion = 1;
    }

    const sesion = await Sesion.create({ ...payload, usuario_id: req.usuario.id }, { transaction });
    await sincronizarSemana(payload.paciente_id, payload.fecha, transaction);
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includeSesion, transaction });
    await transaction.commit();
    return res.status(201).json({
      ...sesionCompleta.toJSON(),
      sincronizacion_semanal: true
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const actualizarSesion = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const sesion = await Sesion.findByPk(req.params.id, { transaction });
    if (!sesion) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Sesion no encontrada' });
    }
    const origen = { paciente_id: sesion.paciente_id, fecha: sesion.fecha };

    const payload = normalizarSesion({ ...sesion.toJSON(), ...req.body });
    const errorValidacion = validarSesion(payload);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    await sesion.update(payload, { transaction });
    await sincronizarSemana(origen.paciente_id, origen.fecha, transaction);
    if (String(origen.paciente_id) !== String(payload.paciente_id) || origen.fecha !== payload.fecha) {
      await sincronizarSemana(payload.paciente_id, payload.fecha, transaction);
    }
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includeSesion, transaction });
    await transaction.commit();
    return res.json({
      ...sesionCompleta.toJSON(),
      sincronizacion_semanal: true
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const eliminarSesion = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const sesion = await Sesion.findByPk(req.params.id, { transaction });
    if (!sesion) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Sesion no encontrada' });
    }
    const origen = { paciente_id: sesion.paciente_id, fecha: sesion.fecha };

    await sesion.destroy({ transaction });
    await sincronizarSemana(origen.paciente_id, origen.fecha, transaction);
    await transaction.commit();
    return res.json({
      message: 'Sesion eliminada correctamente',
      sincronizacion_semanal: true
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
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
