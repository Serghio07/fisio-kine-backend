const { PlanillaPersonal, PlanillaPersonalDetalle, Personal, Usuario, sequelize } = require('../models');

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

const listarPlanillas = async (req, res, next) => {
  try {
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
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { include: includeCompleto });
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada.' });
    return res.json(planilla);
  } catch (error) {
    return next(error);
  }
};

const obtenerPorPeriodo = async (req, res, next) => {
  try {
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

    const personalActivo = await Personal.findAll({
      where: { estado: 'activo' },
      order: [['apellido_paterno', 'ASC'], ['apellido_materno', 'ASC'], ['nombres', 'ASC']],
      transaction
    });
    const planilla = await PlanillaPersonal.create({
      mes,
      anio,
      usuario_id: req.usuario.id,
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
      tipo_pago: persona.tipo_pago
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
    const planilla = await PlanillaPersonal.findByPk(req.params.id, { transaction });
    if (!planilla) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Planilla no encontrada.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'observaciones')) {
      await planilla.update({ observaciones: req.body.observaciones || null }, { transaction });
    }
    if (Array.isArray(req.body.detalles)) {
      await PlanillaPersonalDetalle.destroy({ where: { planilla_id: planilla.id }, transaction });
      await PlanillaPersonalDetalle.bulkCreate(req.body.detalles.map((detalle, index) => ({
        planilla_id: planilla.id,
        personal_id: detalle.personal_id || null,
        numero: index + 1,
        apellido_paterno: detalle.apellido_paterno,
        apellido_materno: detalle.apellido_materno || null,
        nombres: detalle.nombres,
        ci: detalle.ci || null,
        cargo: detalle.cargo || null,
        horario: detalle.horario || null,
        sueldo_base: detalle.tipo_pago === 'por_servicio' ? null : detalle.sueldo_base,
        tipo_pago: detalle.tipo_pago || 'mensual'
      })), { transaction });
    }
    await transaction.commit();
    return res.json(await PlanillaPersonal.findByPk(planilla.id, { include: includeCompleto }));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

module.exports = { listarPlanillas, obtenerPlanilla, obtenerPorPeriodo, crearPlanilla, actualizarPlanilla };
