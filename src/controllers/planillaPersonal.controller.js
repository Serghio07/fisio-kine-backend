const { PlanillaPersonal, PlanillaPersonalDetalle, Personal, Usuario, sequelize } = require('../models');
const { ensurePlanillaPersonalSchema } = require('../services/planillaPersonalSchema.service');

const includeCompleto = [
  { model: Usuario, as: 'creado_por', attributes: ['id', 'nombre', 'usuario'] },
  { model: PlanillaPersonalDetalle, as: 'detalles' }
];

const diasCortos = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mie', jueves: 'Jue',
  viernes: 'Vie', sabado: 'Sab', domingo: 'Dom'
};

const horarioTexto = (persona) => {
  const dias = (persona.dias_trabajo || []).map((dia) => diasCortos[dia] || dia).join(', ');
  const horas = persona.hora_entrada && persona.hora_salida
    ? `${String(persona.hora_entrada).slice(0, 5)}-${String(persona.hora_salida).slice(0, 5)}`
    : '';
  return [dias, horas].filter(Boolean).join(' ');
};

const montoDetalle = (detalle) => detalle.tipo_pago === 'por_servicio'
  ? Number(detalle.monto_servicio || 0)
  : Number(detalle.sueldo_base || 0);

const validarDetalles = (detalles = []) => {
  if (!detalles.length) return 'Debe agregar al menos una persona.';
  const personalIds = new Set();
  for (const detalle of detalles) {
    if (!detalle.personal_id) return 'Todo registro debe estar vinculado al módulo Personal.';
    if (personalIds.has(String(detalle.personal_id))) return 'No se permite personal duplicado.';
    personalIds.add(String(detalle.personal_id));
    if (!detalle.ci || !detalle.cargo || !detalle.horario || !detalle.tipo_pago) return 'CI, cargo, horario y modalidad de pago son obligatorios.';
    if (!['mensual', 'por_servicio', 'otro'].includes(detalle.tipo_pago)) return 'La modalidad de pago no es válida.';
    if (detalle.tipo_pago !== 'por_servicio' && !(Number(detalle.sueldo_base) >= 0)) return 'El sueldo no puede ser negativo.';
    if (detalle.tipo_pago === 'por_servicio' && Number(detalle.monto_servicio || 0) < 0) return 'El monto por servicios no puede ser negativo.';
  }
  return null;
};

const detalleSnapshot = (detalle, index, planillaId) => ({
  planilla_id: planillaId,
  personal_id: detalle.personal_id,
  numero: index + 1,
  apellido_paterno: detalle.apellido_paterno,
  apellido_materno: detalle.apellido_materno || null,
  nombres: detalle.nombres,
  ci: detalle.ci,
  cargo: detalle.cargo,
  horario: detalle.horario,
  sueldo_base: detalle.tipo_pago === 'por_servicio' ? null : Number(detalle.sueldo_base || 0),
  monto_servicio: detalle.tipo_pago === 'por_servicio' ? Number(detalle.monto_servicio || 0) : null,
  tipo_pago: detalle.tipo_pago || 'mensual',
  estado_laboral: detalle.estado_laboral || 'activo',
  firma: detalle.firma || null
});

const listarPlanillas = async (req, res, next) => {
  try {
    await ensurePlanillaPersonalSchema();
    const where = {};
    if (req.query.mes) where.mes = req.query.mes;
    if (req.query.anio) where.anio = req.query.anio;
    const planillas = await PlanillaPersonal.findAll({
      where,
      include: includeCompleto,
      order: [['anio', 'DESC'], ['mes', 'DESC']]
    });
    return res.json(planillas);
  } catch (error) {
    return next(error);
  }
};

const obtenerPlanilla = async (req, res, next) => {
  try {
    await ensurePlanillaPersonalSchema();
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { include: includeCompleto });
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada.' });
    return res.json(planilla);
  } catch (error) {
    return next(error);
  }
};

const obtenerPorPeriodo = async (req, res, next) => {
  try {
    await ensurePlanillaPersonalSchema();
    const planilla = await PlanillaPersonal.findOne({
      where: { mes: req.params.mes, anio: req.params.anio },
      include: includeCompleto
    });
    return planilla ? res.json(planilla) : res.status(404).json({ message: 'No existe planilla para este periodo.' });
  } catch (error) {
    return next(error);
  }
};

const crearPlanilla = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await ensurePlanillaPersonalSchema();
    const mes = Number(req.body.mes);
    const anio = Number(req.body.anio);
    if (mes < 1 || mes > 12 || anio < 2000) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Mes o ano no valido.' });
    }

    const existente = await PlanillaPersonal.findOne({ where: { mes, anio }, transaction });
    if (existente) {
      await transaction.rollback();
      const completa = await PlanillaPersonal.findByPk(existente.id, { include: includeCompleto });
      return res.status(409).json({ message: 'Ya existe una planilla para este mes y ano.', planilla: completa });
    }

    const personalIds = Array.isArray(req.body.personal_ids) ? [...new Set(req.body.personal_ids.map(Number))] : [];
    if (!personalIds.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Debe agregar al menos una persona.' });
    }
    const personalActivo = await Personal.findAll({
      where: { estado: 'activo', ...(personalIds.length ? { id: personalIds } : {}) },
      order: [['apellido_paterno', 'ASC'], ['apellido_materno', 'ASC'], ['nombres', 'ASC']],
      transaction
    });
    if (personalActivo.length !== personalIds.length) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Solo puede incluir personal activo registrado en el módulo Personal.' });
    }
    const planilla = await PlanillaPersonal.create({
      mes,
      anio,
      usuario_id: req.usuario.id,
      fecha_planilla: req.body.fecha_planilla || new Date().toISOString().slice(0, 10),
      estado: req.body.cerrar ? 'cerrada' : 'borrador',
      cerrada_en: req.body.cerrar ? new Date() : null,
      observaciones: req.body.observaciones || null
    }, { transaction });

    await PlanillaPersonalDetalle.bulkCreate(personalActivo.map((persona, index) => ({
      planilla_id: planilla.id,
      personal_id: persona.id,
      numero: index + 1,
      apellido_paterno: persona.apellido_paterno,
      apellido_materno: persona.apellido_materno,
      nombres: persona.nombres,
      ci: persona.ci,
      cargo: persona.cargo,
      horario: horarioTexto(persona),
      sueldo_base: persona.tipo_pago === 'por_servicio' ? null : persona.sueldo_base,
      monto_servicio: null,
      tipo_pago: persona.tipo_pago,
      estado_laboral: persona.estado,
      firma: null
    })), { transaction });

    await transaction.commit();
    return res.status(201).json(await PlanillaPersonal.findByPk(planilla.id, { include: includeCompleto }));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const actualizarPlanilla = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await ensurePlanillaPersonalSchema();
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { transaction });
    if (!planilla) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Planilla no encontrada.' });
    }
    if (planilla.estado !== 'borrador') {
      await transaction.rollback();
      return res.status(409).json({ message: 'Solo las planillas en borrador pueden editarse.' });
    }
    const errorDetalles = Array.isArray(req.body.detalles) ? validarDetalles(req.body.detalles) : null;
    if (errorDetalles) {
      await transaction.rollback();
      return res.status(400).json({ message: errorDetalles });
    }
    await planilla.update({
      mes: req.body.mes ?? planilla.mes,
      anio: req.body.anio ?? planilla.anio,
      fecha_planilla: req.body.fecha_planilla ?? planilla.fecha_planilla,
      observaciones: Object.prototype.hasOwnProperty.call(req.body, 'observaciones') ? req.body.observaciones || null : planilla.observaciones
    }, { transaction });
    if (Array.isArray(req.body.detalles)) {
      await PlanillaPersonalDetalle.destroy({ where: { planilla_id: planilla.id }, transaction });
      await PlanillaPersonalDetalle.bulkCreate(req.body.detalles.map((detalle, index) => detalleSnapshot(detalle, index, planilla.id)), { transaction });
    }
    await transaction.commit();
    return res.json(await PlanillaPersonal.findByPk(planilla.id, { include: includeCompleto }));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const cambiarEstado = (estado) => async (req, res, next) => {
  try {
    await ensurePlanillaPersonalSchema();
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { include: includeCompleto });
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada.' });
    if (estado === 'cerrada' && planilla.estado !== 'borrador') return res.status(409).json({ message: 'Solo una planilla en borrador puede cerrarse.' });
    if (estado === 'borrador' && planilla.estado !== 'cerrada') return res.status(409).json({ message: 'Solo una planilla cerrada puede reabrirse.' });
    if (estado === 'anulada' && planilla.estado === 'anulada') return res.status(409).json({ message: 'La planilla ya está anulada.' });
    await planilla.update({
      estado,
      cerrada_en: estado === 'cerrada' ? new Date() : planilla.cerrada_en,
      reabierta_en: estado === 'borrador' ? new Date() : planilla.reabierta_en,
      anulada_en: estado === 'anulada' ? new Date() : planilla.anulada_en,
      motivo_anulacion: estado === 'anulada' ? req.body.motivo || null : planilla.motivo_anulacion
    });
    return res.json(await PlanillaPersonal.findByPk(planilla.id, { include: includeCompleto }));
  } catch (error) {
    return next(error);
  }
};

const eliminarPlanilla = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await ensurePlanillaPersonalSchema();
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { transaction });
    if (!planilla) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Planilla no encontrada.' });
    }
    if (planilla.estado !== 'borrador') {
      await transaction.rollback();
      return res.status(409).json({ message: 'Solo se pueden eliminar planillas en borrador.' });
    }
    await planilla.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: 'Planilla eliminada correctamente.' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

module.exports = {
  listarPlanillas,
  obtenerPlanilla,
  obtenerPorPeriodo,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
  cerrarPlanilla: cambiarEstado('cerrada'),
  reabrirPlanilla: cambiarEstado('borrador'),
  anularPlanilla: cambiarEstado('anulada'),
  montoDetalle
};
