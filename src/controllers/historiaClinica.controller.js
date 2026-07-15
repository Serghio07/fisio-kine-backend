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
  EvaluacionFinal,
  Personal
} = require('../models');
const { randomUUID } = require('crypto');

const includeCompleto = [
  { model: Paciente, as: 'paciente' },
  {
    model: Usuario,
    as: 'usuario',
    attributes: { exclude: ['password'] },
    include: [{ model: Personal, as: 'ficha_personal' }]
  },
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
  'evolutivo',
  'estado',
  'anulada',
  'anulada_en',
  'anulada_por',
  'motivo_anulacion',
  'observacion_anulacion',
  'restaurada_en',
  'restaurada_por'
];

const pick = (obj, campos) =>
  campos.reduce((data, campo) => {
    if (Object.prototype.hasOwnProperty.call(obj, campo)) data[campo] = obj[campo];
    return data;
  }, {});

const normalizarTexto = (value) => {
  if (typeof value === 'string') {
    const limpio = value.trim().replace(/\s+/g, ' ');
    return limpio ? limpio.toLocaleUpperCase('es-BO') : null;
  }
  if (Array.isArray(value)) return value.map(normalizarTexto);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizarTexto(entry)]));
  }
  return value;
};

const normalizarHistoria = (body) => {
  const data = normalizarTexto(body);
  if (body.estado !== undefined) data.estado = String(body.estado).toLowerCase();
  if (Array.isArray(data.condicion_actual?.tipo_lesion)) {
    data.condicion_actual.tipo_lesion = data.condicion_actual.tipo_lesion.join(',');
  }
  if (data.motivo_consulta === 'OTRO MOTIVO' && data.motivo_consulta_otro) {
    data.motivo_consulta = data.motivo_consulta_otro;
  }
  if (data.evaluacion_final?.periodicidad === 'OTRO' && data.evaluacion_final.periodicidad_otro) {
    data.evaluacion_final.periodicidad = data.evaluacion_final.periodicidad_otro;
  }
  if (data.evaluacion_final?.sesiones_contratadas !== undefined) {
    if (data.evaluacion_final.sesiones_contratadas === null || data.evaluacion_final.sesiones_contratadas === '') {
      delete data.evaluacion_final.sesiones_contratadas;
    } else {
      data.evaluacion_final.sesiones_contratadas = Number(data.evaluacion_final.sesiones_contratadas);
    }
  }
  return data;
};

const resolverProfesional = async (req, transaction) => {
  const profesional = await Usuario.findOne({
    where: {
      id: req.usuario.id,
      estado: 'activo',
      activo: true
    },
    include: [{ model: Personal, as: 'ficha_personal' }],
    transaction
  });
  return profesional || req.usuario;
};

const nombreProfesional = (profesional) =>
  profesional.ficha_personal?.nombre_mostrado || profesional.nombre;

const validarHistoria = (body, partial = false) => {
  if (!partial && !body.paciente_id) return 'paciente_id es requerido';
  if (!partial && !body.fecha_evaluacion) return 'fecha_evaluacion es requerida';
  if (!partial && !body.profesional_cargo) return 'Selecciona el profesional a cargo';
  if (body.evolutivo !== undefined && !Array.isArray(body.evolutivo)) return 'El evolutivo debe ser una lista de sesiones';
  if (body.estado === 'activa' && body.evaluacion_final !== undefined) {
    const sesionesContratadas = Number(body.evaluacion_final?.sesiones_contratadas || 0);
    if (!Number.isInteger(sesionesContratadas) || sesionesContratadas <= 0) {
      return 'sesiones_contratadas es requerido y debe ser mayor que cero';
    }
  }

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

const prepararEvolutivo = (sesiones, historia, anteriores = []) => {
  if (!Array.isArray(sesiones)) return sesiones;
  const ahora = new Date().toISOString();
  return sesiones.map((sesion, index) => {
    const anterior = anteriores.find((item) => item.id && item.id === sesion.id) || anteriores[index] || {};
    return {
      ...sesion,
      id: sesion.id || anterior.id || randomUUID(),
      historia_clinica_id: historia.id,
      paciente_id: historia.paciente_id,
      numero_sesion: Number(sesion.numero_sesion || sesion.numero || index + 1),
      fecha_sesion: sesion.fecha_sesion || sesion.fecha || null,
      procedimiento_realizado: sesion.procedimiento_realizado || sesion.aplicacion || null,
      fecha_creacion: sesion.fecha_creacion || anterior.fecha_creacion || ahora,
      fecha_actualizacion: ahora
    };
  });
};

const listarHistorias = async (req, res, next) => {
  try {
    const historias = await HistoriaClinica.findAll({
      include: includeCompleto,
      order: [['id', 'DESC']],
      limit: 500
    });
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
    const profesional = await resolverProfesional(req, transaction);
    const body = normalizarHistoria({
      ...req.body,
      usuario_id: profesional.id,
      profesional_cargo: nombreProfesional(profesional),
      evaluacion_final: {
        ...req.body.evaluacion_final,
        profesional_cargo: nombreProfesional(profesional)
      }
    });
    const errorValidacion = validarHistoria(body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    const paciente = await Paciente.findByPk(body.paciente_id, { transaction });
    if (!paciente) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const historia = await HistoriaClinica.create(
      pick(body, camposHistoria),
      { transaction }
    );
    if (Array.isArray(body.evolutivo)) {
      await historia.update({ evolutivo: prepararEvolutivo(body.evolutivo, historia) }, { transaction });
    }

    await crearOActualizarRelacion(AntecedentePersonal, historia.id, body.antecedente_personal, transaction);
    await crearOActualizarRelacion(AntecedenteFamiliar, historia.id, body.antecedente_familiar, transaction);
    await crearOActualizarRelacion(ExamenKinesico, historia.id, body.examen_kinesico, transaction);
    await crearOActualizarRelacion(CondicionActual, historia.id, body.condicion_actual, transaction);
    await crearOActualizarRelacion(IntervencionClinica, historia.id, body.intervencion_clinica, transaction);
    await crearOActualizarRelacion(EvaluacionFinal, historia.id, body.evaluacion_final, transaction);

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

    const profesional = await resolverProfesional(req, transaction);
    const requestData = {
      ...req.body,
      usuario_id: profesional.id,
      profesional_cargo: nombreProfesional(profesional)
    };
    if (req.body.evaluacion_final !== undefined) {
      requestData.evaluacion_final = {
        ...req.body.evaluacion_final,
        profesional_cargo: nombreProfesional(profesional)
      };
    }
    const body = normalizarHistoria(requestData);
    const errorValidacion = validarHistoria(body, true);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    if (Array.isArray(body.evolutivo)) {
      body.evolutivo = prepararEvolutivo(body.evolutivo, historia, historia.evolutivo || []);
    }
    await historia.update(pick(body, camposHistoria), { transaction });
    await crearOActualizarRelacion(AntecedentePersonal, historia.id, body.antecedente_personal, transaction);
    await crearOActualizarRelacion(AntecedenteFamiliar, historia.id, body.antecedente_familiar, transaction);
    await crearOActualizarRelacion(ExamenKinesico, historia.id, body.examen_kinesico, transaction);
    await crearOActualizarRelacion(CondicionActual, historia.id, body.condicion_actual, transaction);
    await crearOActualizarRelacion(IntervencionClinica, historia.id, body.intervencion_clinica, transaction);
    await crearOActualizarRelacion(EvaluacionFinal, historia.id, body.evaluacion_final, transaction);

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
    if (historia.estado === 'anulada') {
      return res.status(400).json({ message: 'La historia clinica ya esta anulada' });
    }

    const motivo = typeof req.body?.motivo_anulacion === 'string'
      ? req.body.motivo_anulacion.trim()
      : '';
    if (!motivo) {
      return res.status(400).json({ message: 'El motivo de anulacion es obligatorio' });
    }

    const profesional = await resolverProfesional(req);

    await historia.update({
      estado: 'anulada',
      anulada: true,
      anulada_en: new Date(),
      anulada_por: nombreProfesional(profesional),
      motivo_anulacion: normalizarTexto(motivo),
      observacion_anulacion: normalizarTexto(req.body?.observacion_anulacion || null),
      restaurada_en: null,
      restaurada_por: null
    });
    return res.json({ message: 'Historia clinica anulada correctamente', historia });
  } catch (error) {
    return next(error);
  }
};

const restaurarHistoria = async (req, res, next) => {
  try {
    const historia = await HistoriaClinica.findByPk(req.params.id);
    if (!historia) return res.status(404).json({ message: 'Historia clinica no encontrada' });
    if (historia.estado !== 'anulada') {
      return res.status(400).json({ message: 'Solo se pueden restaurar historias anuladas' });
    }

    const profesional = await resolverProfesional(req);

    await historia.update({
      estado: 'activa',
      anulada: false,
      restaurada_en: new Date(),
      restaurada_por: nombreProfesional(profesional)
    });
    return res.json({ message: 'Historia clinica restaurada como activa.', historia });
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
  eliminarHistoria,
  restaurarHistoria
};
