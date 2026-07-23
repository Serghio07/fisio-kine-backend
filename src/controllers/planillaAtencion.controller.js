const { Op } = require('sequelize');
const { HistoriaClinica, Paciente, PlanillaAtencion, PlanillaSesion, Sesion } = require('../models');
const { ensurePlanillaAtencionSchema } = require('../services/planillaAtencionSchema.service');

const includeCompleto = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica' },
  { model: PlanillaSesion, as: 'sesiones', include: [{ model: Sesion, as: 'sesion_registrada' }], order: [['numero_sesion', 'ASC']] }
];

const esFechaValida = (value) => !value || !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

const validarPlanilla = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!esFechaValida(body.fecha_inicio)) return 'fecha_inicio no es valida';
  if (!esFechaValida(body.fecha_fin)) return 'fecha_fin no es valida';
  if (Array.isArray(body.sesiones)) {
    const usados = new Set();
    for (const sesion of body.sesiones) {
      if (!sesion.fecha) return 'Cada sesion debe tener fecha';
      if (!esFechaValida(sesion.fecha)) return 'Hay una fecha de sesion no valida';
      if (!sesion.numero_sesion) return 'Cada sesion debe tener numero_sesion';
      if (usados.has(Number(sesion.numero_sesion))) return 'No se permiten sesiones duplicadas en la misma planilla';
      usados.add(Number(sesion.numero_sesion));
    }
  }
  return null;
};

const normalizarPlanilla = (body) => ({
  paciente_id: body.paciente_id,
  historia_clinica_id: body.historia_clinica_id || null,
  fecha_inicio: body.fecha_inicio || null,
  fecha_fin: body.fecha_fin || null,
  diagnostico: body.diagnostico,
  observacion: body.observacion
});

const normalizarSesion = (body, planilla) => ({
  planilla_id: planilla.id,
  paciente_id: planilla.paciente_id,
  sesion_id: body.sesion_id || null,
  fecha: body.fecha,
  numero_sesion: Number(body.numero_sesion),
  firma_paciente: body.firma_paciente,
  firma_profesional: body.firma_profesional,
  observacion: body.observacion
});

const obtenerCompleta = (id) =>
  PlanillaAtencion.findByPk(id, {
    include: includeCompleto,
    order: [[{ model: PlanillaSesion, as: 'sesiones' }, 'numero_sesion', 'ASC']]
  });

const listarPlanillas = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planillas = await PlanillaAtencion.findAll({
      include: includeCompleto,
      order: [['created_at', 'DESC'], ['id', 'DESC']]
    });
    return res.json(planillas);
  } catch (error) {
    return next(error);
  }
};

const listarPlanillasPaciente = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planillas = await PlanillaAtencion.findAll({
      where: { paciente_id: req.params.id },
      include: includeCompleto,
      order: [['created_at', 'DESC'], ['id', 'DESC']]
    });
    return res.json(planillas);
  } catch (error) {
    return next(error);
  }
};

const obtenerPlanilla = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planilla = await obtenerCompleta(req.params.id);
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada' });
    return res.json(planilla);
  } catch (error) {
    return next(error);
  }
};

const crearPlanilla = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const errorValidacion = validarPlanilla(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });
    if (req.body.historia_clinica_id) {
      const historia = await HistoriaClinica.findOne({ where: { id: req.body.historia_clinica_id, paciente_id: req.body.paciente_id } });
      if (!historia) return res.status(400).json({ message: 'La historia clínica no pertenece al paciente seleccionado' });
    }

    const planilla = await PlanillaAtencion.create(normalizarPlanilla(req.body));
    if (Array.isArray(req.body.sesiones) && req.body.sesiones.length) {
      await PlanillaSesion.bulkCreate(req.body.sesiones.map((sesion) => normalizarSesion(sesion, planilla)));
    }

    return res.status(201).json(await obtenerCompleta(planilla.id));
  } catch (error) {
    return next(error);
  }
};

const actualizarPlanilla = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planilla = await PlanillaAtencion.findByPk(req.params.id);
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada' });

    const payload = { ...planilla.toJSON(), ...req.body };
    const errorValidacion = validarPlanilla(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (payload.historia_clinica_id) {
      const historia = await HistoriaClinica.findOne({ where: { id: payload.historia_clinica_id, paciente_id: payload.paciente_id } });
      if (!historia) return res.status(400).json({ message: 'La historia clínica no pertenece al paciente seleccionado' });
    }

    await planilla.update(normalizarPlanilla(payload));
    if (Array.isArray(req.body.sesiones)) {
      await PlanillaSesion.destroy({ where: { planilla_id: planilla.id } });
      if (req.body.sesiones.length) {
        await PlanillaSesion.bulkCreate(req.body.sesiones.map((sesion) => normalizarSesion(sesion, planilla)));
      }
    }

    return res.json(await obtenerCompleta(planilla.id));
  } catch (error) {
    return next(error);
  }
};

const eliminarPlanilla = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planilla = await PlanillaAtencion.findByPk(req.params.id);
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada' });
    await planilla.destroy();
    return res.json({ message: 'Planilla eliminada correctamente' });
  } catch (error) {
    return next(error);
  }
};

const crearSesion = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planilla = await PlanillaAtencion.findByPk(req.params.id);
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada' });
    if (!req.body.fecha) return res.status(400).json({ message: 'fecha es requerida' });
    if (!req.body.numero_sesion) return res.status(400).json({ message: 'numero_sesion es requerido' });

    const existe = await PlanillaSesion.findOne({
      where: { planilla_id: planilla.id, numero_sesion: Number(req.body.numero_sesion) }
    });
    if (existe) return res.status(400).json({ message: 'Ese numero de sesion ya existe en la planilla' });

    await PlanillaSesion.create(normalizarSesion(req.body, planilla));
    return res.status(201).json(await obtenerCompleta(planilla.id));
  } catch (error) {
    return next(error);
  }
};

const actualizarSesion = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const sesion = await PlanillaSesion.findByPk(req.params.id);
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });
    if (req.body.fecha !== undefined && !req.body.fecha) return res.status(400).json({ message: 'fecha es requerida' });
    if (req.body.numero_sesion !== undefined && !req.body.numero_sesion) return res.status(400).json({ message: 'numero_sesion es requerido' });

    if (req.body.numero_sesion) {
      const duplicada = await PlanillaSesion.findOne({
        where: {
          planilla_id: sesion.planilla_id,
          numero_sesion: Number(req.body.numero_sesion),
          id: { [Op.ne]: sesion.id }
        }
      });
      if (duplicada) return res.status(400).json({ message: 'Ese numero de sesion ya existe en la planilla' });
    }

    await sesion.update({
      fecha: req.body.fecha ?? sesion.fecha,
      numero_sesion: req.body.numero_sesion ? Number(req.body.numero_sesion) : sesion.numero_sesion,
      sesion_id: req.body.sesion_id ?? sesion.sesion_id,
      firma_paciente: req.body.firma_paciente ?? sesion.firma_paciente,
      firma_profesional: req.body.firma_profesional ?? sesion.firma_profesional,
      observacion: req.body.observacion ?? sesion.observacion
    });

    return res.json(await obtenerCompleta(sesion.planilla_id));
  } catch (error) {
    return next(error);
  }
};

const eliminarSesion = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const sesion = await PlanillaSesion.findByPk(req.params.id);
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });
    const planillaId = sesion.planilla_id;
    await sesion.destroy();
    return res.json(await obtenerCompleta(planillaId));
  } catch (error) {
    return next(error);
  }
};

const descargarPdf = async (req, res, next) => {
  try {
    await ensurePlanillaAtencionSchema();
    const planilla = await obtenerCompleta(req.params.id);
    if (!planilla) return res.status(404).json({ message: 'Planilla no encontrada' });
    return res.json({
      message: 'Usa los datos de esta planilla para generar el PDF desde el frontend.',
      planilla
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarPlanillas,
  listarPlanillasPaciente,
  obtenerPlanilla,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
  crearSesion,
  actualizarSesion,
  eliminarSesion,
  descargarPdf
};
