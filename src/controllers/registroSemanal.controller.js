const { Op } = require('sequelize');
const { HistoriaClinica, Paciente, RegistroSemanal, Sesion, sequelize } = require('../models');
const { ensureRegistroSemanalSchema } = require('../services/registroSemanalSchema.service');
const { sincronizarSemana } = require('../services/sesionSemanalSync.service');

const includeRegistroSemanal = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica' }
];

const validar = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.semana_inicio) return 'semana_inicio es requerida';
  if (!body.semana_fin) return 'semana_fin es requerida';
  if (body.debe_bs !== undefined && Number(body.debe_bs || 0) < 0) return 'debe_bs no puede ser negativo';
  return null;
};

const normalizar = (body) => ({
  semana_inicio: body.semana_inicio,
  semana_fin: body.semana_fin,
  paciente_id: body.paciente_id,
  historia_clinica_id: body.historia_clinica_id || null,
  diagnostico: body.diagnostico,
  telefono: body.telefono,
  edad: body.edad === '' || body.edad === null ? null : Number(body.edad || 0),
  sexo: body.sexo || null,
  lunes: body.lunes,
  martes: body.martes,
  miercoles: body.miercoles,
  jueves: body.jueves,
  viernes: body.viernes,
  sabado: body.sabado,
  debe_bs: body.debe_bs === '' || body.debe_bs === null ? 0 : Number(body.debe_bs || 0),
  observacion: body.observacion
});

const listarRegistros = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const where = {
      total_sesiones: { [Op.gt]: 0 },
      sincronizado_sesiones: true
    };
    if (req.query.fecha_inicio && req.query.fecha_fin) {
      where.semana_inicio = { [Op.lte]: req.query.fecha_fin };
      where.semana_fin = { [Op.gte]: req.query.fecha_inicio };
    } else {
      if (req.query.semana_inicio) where.semana_inicio = req.query.semana_inicio;
      if (req.query.semana_fin) where.semana_fin = req.query.semana_fin;
    }

    const registros = await RegistroSemanal.findAll({
      where,
      include: includeRegistroSemanal,
      order: [['semana_inicio', 'DESC'], ['id', 'DESC']]
    });
    return res.json(registros);
  } catch (error) {
    return next(error);
  }
};

const obtenerRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const registro = await RegistroSemanal.findByPk(req.params.id, { include: includeRegistroSemanal });
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });
    return res.json(registro);
  } catch (error) {
    return next(error);
  }
};

const crearRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const errorValidacion = validar(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const existente = await RegistroSemanal.findOne({
      where: {
        paciente_id: req.body.paciente_id,
        semana_inicio: req.body.semana_inicio,
        historia_clinica_id: req.body.historia_clinica_id || null
      },
      order: [['id', 'ASC']]
    });

    if (existente) {
      await existente.update({
        ...normalizar(req.body),
        aplica_farmacos: existente.aplica_farmacos,
        generado_automaticamente: false
      });
      const completoExistente = await RegistroSemanal.findByPk(existente.id, { include: includeRegistroSemanal });
      return res.json(completoExistente);
    }

    const registro = await RegistroSemanal.create({
      ...normalizar(req.body),
      aplica_farmacos: false,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includeRegistroSemanal });
    return res.status(201).json(completo);
  } catch (error) {
    return next(error);
  }
};

const actualizarRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    const payload = normalizar({ ...registro.toJSON(), ...req.body });
    const errorValidacion = validar(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    await registro.update({
      ...payload,
      aplica_farmacos: registro.aplica_farmacos,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includeRegistroSemanal });
    return res.json(completo);
  } catch (error) {
    return next(error);
  }
};

const eliminarRegistro = async (req, res, next) => {
  try {
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    await registro.destroy();
    return res.json({ message: 'Registro semanal eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

const recalcularSemana = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await ensureRegistroSemanalSchema(transaction);
    const semanaInicio = req.body?.fecha_inicio || req.query.fecha_inicio || req.body?.semana_inicio || req.query.semana_inicio;
    const semanaFin = req.body?.fecha_fin || req.query.fecha_fin || req.body?.semana_fin || req.query.semana_fin;
    if (!semanaInicio || !semanaFin) {
      await transaction.rollback();
      return res.status(400).json({ message: 'fecha_inicio y fecha_fin son requeridas' });
    }

    const sesiones = await Sesion.findAll({
      attributes: ['paciente_id', 'fecha'],
      where: {
        fecha: { [Op.between]: [semanaInicio, semanaFin] },
        anulada: false
      },
      order: [['fecha', 'ASC'], ['id', 'ASC']],
      transaction
    });

    const procesadas = new Set();
    for (const sesion of sesiones) {
      const key = `${sesion.paciente_id}:${sesion.fecha}`;
      if (procesadas.has(key)) continue;
      await sincronizarSemana(sesion.paciente_id, sesion.fecha, transaction);
      procesadas.add(key);
    }

    await transaction.commit();

    const registros = await RegistroSemanal.findAll({
      where: {
        semana_inicio: { [Op.lte]: semanaFin },
        semana_fin: { [Op.gte]: semanaInicio },
        total_sesiones: { [Op.gt]: 0 },
        sincronizado_sesiones: true
      },
      include: includeRegistroSemanal,
      order: [['id', 'DESC']]
    });

    return res.json({
      message: 'Resumen actualizado desde sesiones diarias',
      total: registros.length,
      registros
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

module.exports = {
  listarRegistros,
  obtenerRegistro,
  crearRegistro,
  actualizarRegistro,
  eliminarRegistro,
  recalcularSemana
};
