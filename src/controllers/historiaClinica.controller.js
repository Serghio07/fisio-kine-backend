const {
  sequelize,
  HistoriaClinica,
  Paciente,
  Usuario,
  AntecedentePersonal,
  AntecedenteFamiliar,
  ExamenKinesico,
  CondicionActual,
  IntervencionClinica,
  EvaluacionFinal
} = require('../models');

const includeCompleto = [
  { model: Paciente, as: 'paciente' },
  { model: Usuario, as: 'usuario', attributes: { exclude: ['password'] } },
  { model: AntecedentePersonal, as: 'antecedente_personal' },
  { model: AntecedenteFamiliar, as: 'antecedente_familiar' },
  { model: ExamenKinesico, as: 'examen_kinesico' },
  { model: CondicionActual, as: 'condicion_actual' },
  { model: IntervencionClinica, as: 'intervencion_clinica' },
  { model: EvaluacionFinal, as: 'evaluacion_final' }
];

const camposHistoria = [
  'paciente_id',
  'usuario_id',
  'fecha_evaluacion',
  'lugar_fecha_nacimiento',
  'peso',
  'talla',
  'imc',
  'diagnostico_medico',
  'motivo_consulta',
  'enfermedad_actual',
  'profesional_cargo',
  'estado'
];

const pick = (obj, campos) =>
  campos.reduce((data, campo) => {
    if (Object.prototype.hasOwnProperty.call(obj, campo)) data[campo] = obj[campo];
    return data;
  }, {});

const validarHistoria = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.fecha_evaluacion) return 'fecha_evaluacion es requerida';

  const escalaDolor = body.intervencion_clinica?.escala_dolor;
  if (escalaDolor !== undefined && (escalaDolor < 0 || escalaDolor > 10)) {
    return 'escala_dolor debe estar entre 0 y 10';
  }

  return null;
};

const crearOActualizarRelacion = async (Modelo, historiaId, data, transaction) => {
  if (!data) return;

  const actual = await Modelo.findOne({ where: { historia_clinica_id: historiaId }, transaction });
  if (actual) {
    await actual.update(data, { transaction });
    return;
  }

  await Modelo.create({ ...data, historia_clinica_id: historiaId }, { transaction });
};

const listarHistorias = async (req, res, next) => {
  try {
    const historias = await HistoriaClinica.findAll({ include: includeCompleto, order: [['id', 'DESC']] });
    return res.json(historias);
  } catch (error) {
    return next(error);
  }
};

const obtenerHistoria = async (req, res, next) => {
  try {
    const historia = await HistoriaClinica.findByPk(req.params.id, { include: includeCompleto });
    if (!historia) return res.status(404).json({ message: 'Historia clinica no encontrada' });
    return res.json(historia);
  } catch (error) {
    return next(error);
  }
};

const listarHistoriasPorPaciente = async (req, res, next) => {
  try {
    const historias = await HistoriaClinica.findAll({
      where: { paciente_id: req.params.pacienteId },
      include: includeCompleto,
      order: [['id', 'DESC']]
    });
    return res.json(historias);
  } catch (error) {
    return next(error);
  }
};

const crearHistoria = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const errorValidacion = validarHistoria(req.body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    const paciente = await Paciente.findByPk(req.body.paciente_id, { transaction });
    if (!paciente) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const historia = await HistoriaClinica.create(
      { ...pick(req.body, camposHistoria), usuario_id: req.body.usuario_id || req.usuario.id },
      { transaction }
    );

    await crearOActualizarRelacion(AntecedentePersonal, historia.id, req.body.antecedente_personal, transaction);
    await crearOActualizarRelacion(AntecedenteFamiliar, historia.id, req.body.antecedente_familiar, transaction);
    await crearOActualizarRelacion(ExamenKinesico, historia.id, req.body.examen_kinesico, transaction);
    await crearOActualizarRelacion(CondicionActual, historia.id, req.body.condicion_actual, transaction);
    await crearOActualizarRelacion(IntervencionClinica, historia.id, req.body.intervencion_clinica, transaction);
    await crearOActualizarRelacion(EvaluacionFinal, historia.id, req.body.evaluacion_final, transaction);

    await transaction.commit();

    const historiaCompleta = await HistoriaClinica.findByPk(historia.id, { include: includeCompleto });
    return res.status(201).json(historiaCompleta);
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const actualizarHistoria = async (req, res, next) => {
  const transaction = await sequelize.transaction();

  try {
    const historia = await HistoriaClinica.findByPk(req.params.id, { transaction });
    if (!historia) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Historia clinica no encontrada' });
    }

    const errorValidacion = validarHistoria({ ...historia.toJSON(), ...req.body });
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    await historia.update(pick(req.body, camposHistoria), { transaction });
    await crearOActualizarRelacion(AntecedentePersonal, historia.id, req.body.antecedente_personal, transaction);
    await crearOActualizarRelacion(AntecedenteFamiliar, historia.id, req.body.antecedente_familiar, transaction);
    await crearOActualizarRelacion(ExamenKinesico, historia.id, req.body.examen_kinesico, transaction);
    await crearOActualizarRelacion(CondicionActual, historia.id, req.body.condicion_actual, transaction);
    await crearOActualizarRelacion(IntervencionClinica, historia.id, req.body.intervencion_clinica, transaction);
    await crearOActualizarRelacion(EvaluacionFinal, historia.id, req.body.evaluacion_final, transaction);

    await transaction.commit();

    const historiaCompleta = await HistoriaClinica.findByPk(historia.id, { include: includeCompleto });
    return res.json(historiaCompleta);
  } catch (error) {
    await transaction.rollback();
    return next(error);
  }
};

const eliminarHistoria = async (req, res, next) => {
  try {
    const historia = await HistoriaClinica.findByPk(req.params.id);
    if (!historia) return res.status(404).json({ message: 'Historia clinica no encontrada' });

    await historia.destroy();
    return res.json({ message: 'Historia clinica eliminada correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarHistorias,
  obtenerHistoria,
  listarHistoriasPorPaciente,
  crearHistoria,
  actualizarHistoria,
  eliminarHistoria
};
