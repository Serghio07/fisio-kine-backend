const { Op } = require('sequelize');
const { Cita, ESTADOS_CITA, EvaluacionFinal, HistoriaClinica, Paciente, Personal, Sesion, TIPOS_ATENCION, Usuario, sequelize } = require('../models');
const { boliviaDate } = require('../utils/boliviaDateTime');
const { actualizarCitasNoAsistidas } = require('../services/citaEstado.service');
const { BLOCKING_APPOINTMENT_STATUSES } = require('../services/appointmentAvailability.service');
const { ensureNoShowSession } = require('../services/citaSesionLink.service');
const { cleanupTemporaryWhatsappNoShow } = require('../services/temporaryWhatsappPatientCleanup.service');
const { clinicalPatientEligibilityError } = require('../services/clinicalPatientEligibility.service');

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
  ,
  { model: HistoriaClinica, as: 'historia_clinica', include: [{ model: EvaluacionFinal, as: 'evaluacion_final' }] },
  { model: Usuario, as: 'profesional', attributes: ['id', 'nombre', 'usuario', 'foto'] },
  { model: Sesion, as: 'sesion_clinica', attributes: ['id', 'fecha', 'numero_sesion', 'asistencia'] }
];

const includeCitaAgenda = [
  {
    model: Paciente,
    as: 'paciente',
    required: true,
    where: {
      [Op.or]: [
        { estado: true },
        { registro_pendiente: false }
      ]
    }
  },
  ...includeCita.slice(1)
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
  observacion: body.observacion,
  profesional_id: body.profesional_id || null,
  historia_clinica_id: body.historia_clinica_id || null,
  sesion_id: body.sesion_id || null,
  numero_sesion: body.numero_sesion || null,
  total_sesiones: body.total_sesiones || null
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
  if (!BLOCKING_APPOINTMENT_STATUSES.includes(payload.estado)) return null;

  const inicio = payload.hora_inicio;
  if (!payload.hora_fin) {
    const where = {
      fecha: payload.fecha,
      hora_inicio: inicio,
      estado: { [Op.in]: BLOCKING_APPOINTMENT_STATUSES }
    };
    if (citaId) where.id = { [Op.ne]: citaId };
    const citaExistente = await Cita.findOne({ where });
    return citaExistente ? 'Ya existe una cita activa en ese horario' : null;
  }

  const fin = payload.hora_fin;
  const where = {
    fecha: payload.fecha,
    estado: { [Op.in]: BLOCKING_APPOINTMENT_STATUSES },
    [Op.and]: [
      { hora_inicio: { [Op.lt]: fin } },
      { [Op.or]: [{ hora_fin: { [Op.gt]: inicio } }, { hora_fin: null, hora_inicio: { [Op.gte]: inicio, [Op.lt]: fin } }] }
    ]
  };
  if (payload.profesional_id && payload.paciente_id) {
    where[Op.or] = [{ profesional_id: payload.profesional_id }, { paciente_id: payload.paciente_id }];
  }

  if (citaId) where.id = { [Op.ne]: citaId };

  const citaExistente = await Cita.findOne({ where });
  return citaExistente ? 'Ya existe una cita activa en ese rango de horario' : null;
};

const resumenProgramacion = async (historiaId, transaction) => {
  await actualizarCitasNoAsistidas(transaction);
  const historia = await HistoriaClinica.findByPk(historiaId, {
    include: [{ model: EvaluacionFinal, as: 'evaluacion_final' }],
    transaction
  });
  if (!historia) return null;
  const indicadas = Number(historia.evaluacion_final?.sesiones_contratadas || 0);
  const realizadas = await Sesion.count({
    where: { historia_clinica_id: historia.id, asistencia: 'asistio', anulada: false },
    transaction
  });
  const programaciones = await Cita.findAll({
    where: { historia_clinica_id: historia.id, origen: 'Plan de tratamiento' },
    include: includeCita,
    order: [['numero_sesion', 'ASC'], ['id', 'DESC']],
    transaction
  });
  const activas = programaciones.filter((c) => !['Cancelada', 'Reprogramada'].includes(c.estado));
  const numerosActivos = new Set(activas.map((c) => c.numero_sesion));
  return {
    historia,
    indicadas,
    realizadas,
    programadas: activas.filter((c) => ['Programada', 'Confirmada'].includes(c.estado)).length,
    pendientes_programar: Math.max(indicadas - realizadas - numerosActivos.size, 0),
    restantes: Math.max(indicadas - realizadas, 0),
    canceladas: programaciones.filter((c) => c.estado === 'Cancelada').length,
    faltas: programaciones.filter((c) => ['Falto', 'No asistio'].includes(c.estado)).length,
    porcentaje: indicadas ? Math.round(realizadas * 100 / indicadas) : 0,
    programaciones
  };
};

const obtenerProgramacionHistoria = async (req, res, next) => {
  try {
    const resumen = await resumenProgramacion(req.params.id);
    if (!resumen) return res.status(404).json({ message: 'Historia clinica no encontrada' });
    return res.json(resumen);
  } catch (error) { return next(error); }
};

const validarDisponibilidad = async (req, res, next) => {
  try {
    const payload = { ...req.body, hora_inicio: normalizarHora(req.body.hora_inicio), hora_fin: normalizarHora(req.body.hora_fin), estado: 'Programada' };
    if (payload.fecha < boliviaDate()) return res.status(400).json({ disponible: false, message: 'La fecha no puede ser anterior al dia actual' });
    const error = validarCita(payload) || await validarSolapamiento(payload, req.body.cita_id);
    return res.status(error ? 409 : 200).json({ disponible: !error, message: error || 'Horario disponible' });
  } catch (error) { return next(error); }
};

const crearProgramacion = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const historia = await HistoriaClinica.findByPk(req.params.id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!historia) { await transaction.rollback(); return res.status(404).json({ message: 'Historia clinica no encontrada' }); }
    const evaluacionFinal = await EvaluacionFinal.findOne({
      where: { historia_clinica_id: historia.id },
      transaction
    });
    const indicadas = Number(evaluacionFinal?.sesiones_contratadas || 0);
    if (indicadas <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La historia clinica no tiene sesiones indicadas' });
    }
    const items = Array.isArray(req.body.programaciones) ? req.body.programaciones : [];
    if (!items.length) { await transaction.rollback(); return res.status(400).json({ message: 'Debe incluir al menos una fecha' }); }
    const numeros = new Set();
    for (const item of items) {
      const numero = Number(item.numero_sesion);
      if (!numero || numero > indicadas || numeros.has(numero)) throw Object.assign(new Error('Numero de sesion invalido o duplicado'), { status: 400 });
      numeros.add(numero);
      if (item.fecha < boliviaDate()) throw Object.assign(new Error('No se permiten fechas anteriores al dia actual'), { status: 400 });
      const payload = { ...item, paciente_id: historia.paciente_id, hora_inicio: normalizarHora(item.hora_inicio), hora_fin: normalizarHora(item.hora_fin), estado: 'Programada' };
      const validation = validarCita(payload) || await validarSolapamiento(payload);
      if (validation) throw Object.assign(new Error(`Sesion ${numero}: ${validation}`), { status: 409 });
      const duplicada = await Cita.findOne({ where: { historia_clinica_id: historia.id, numero_sesion: numero, origen: 'Plan de tratamiento', estado: { [Op.notIn]: ['Cancelada', 'Reprogramada'] } }, transaction });
      if (duplicada) throw Object.assign(new Error(`La sesion ${numero} ya esta programada`), { status: 409 });
    }
    for (const item of items) {
      await Cita.create({
        paciente_id: historia.paciente_id, historia_clinica_id: historia.id,
        profesional_id: item.profesional_id || req.usuario.id, usuario_id: req.usuario.id,
        numero_sesion: Number(item.numero_sesion), total_sesiones: indicadas,
        fecha: item.fecha, hora_inicio: normalizarHora(item.hora_inicio), hora_fin: normalizarHora(item.hora_fin),
        fecha_programada_original: item.fecha, hora_inicio_original: normalizarHora(item.hora_inicio), hora_fin_original: normalizarHora(item.hora_fin),
        tipo_atencion: 'Sesion de tratamiento', motivo: `Sesion ${item.numero_sesion} de ${indicadas}`,
        estado: 'Programada', origen: 'Plan de tratamiento', observacion: item.observacion
      }, { transaction });
    }
    await transaction.commit();
    return res.status(201).json(await resumenProgramacion(historia.id));
  } catch (error) {
    await transaction.rollback();
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
};

const buildFiltros = (query = {}) => {
  const where = {};
  if (query.paciente_id) where.paciente_id = query.paciente_id;
  if (query.historia_clinica_id) where.historia_clinica_id = query.historia_clinica_id;
  if (query.origen) where.origen = query.origen;
  if (query.fecha) where.fecha = query.fecha;
  if (query.estado) where.estado = query.estado;
  if (query.tipo_atencion) where.tipo_atencion = query.tipo_atencion;
  if (query.profesional_id) where.profesional_id = query.profesional_id;
  if (query.fecha_inicio || query.fecha_fin) {
    where.fecha = {};
    if (query.fecha_inicio) where.fecha[Op.gte] = query.fecha_inicio;
    if (query.fecha_fin) where.fecha[Op.lte] = query.fecha_fin;
  }
  return where;
};

const listarCitas = async (req, res, next) => {
  try {
    await actualizarCitasNoAsistidas();
    const citas = await Cita.findAll({
      where: buildFiltros(req.query),
      include: includeCitaAgenda,
      order: [['fecha', 'DESC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const obtenerCita = async (req, res, next) => {
  try {
    await actualizarCitasNoAsistidas();
    const cita = await Cita.findByPk(req.params.id, { include: includeCita });
    if (!cita) return res.status(404).json({ message: 'Cita no encontrada' });
    return res.json(cita);
  } catch (error) {
    return next(error);
  }
};

const crearCita = async (req, res, next) => {
  try {
    const payload = normalizarCita({ ...req.body, estado: 'Pendiente', profesional_id: req.user.id });
    const errorValidacion = validarCita(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(payload.paciente_id);
    const pacienteError = clinicalPatientEligibilityError(paciente);
    if (pacienteError) return res.status(pacienteError.status).json({ message: pacienteError.message });

    const errorSolapamiento = await validarSolapamiento(payload);
    if (errorSolapamiento) return res.status(409).json({ message: errorSolapamiento });

    const cita = await Cita.create({
      ...payload,
      estado: 'Pendiente',
      usuario_id: req.user.id,
      profesional_id: req.user.id
    });
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.status(201).json(citaCompleta);
  } catch (error) {
    return next(error);
  }
};

const actualizarCita = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const cita = await Cita.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!cita) { await transaction.rollback(); return res.status(404).json({ message: 'Cita no encontrada' }); }

    const payload = normalizarCita({ ...cita.toJSON(), ...req.body });
    const errorValidacion = validarCita(payload);
    if (errorValidacion) { await transaction.rollback(); return res.status(400).json({ message: errorValidacion }); }

    const paciente = await Paciente.findByPk(payload.paciente_id, { transaction });
    const pacienteError = clinicalPatientEligibilityError(paciente);
    if (pacienteError) { await transaction.rollback(); return res.status(pacienteError.status).json({ message: pacienteError.message }); }

    const errorSolapamiento = await validarSolapamiento(payload, cita.id);
    if (errorSolapamiento) { await transaction.rollback(); return res.status(409).json({ message: errorSolapamiento }); }

    await cita.update(payload, { transaction });
    if (['No asistio', 'Cancelada'].includes(payload.estado)) {
      const cleanup = await cleanupTemporaryWhatsappNoShow(cita, { transaction });
      if (payload.estado === 'No asistio' && !cleanup.temporary) await ensureNoShowSession(cita, { transaction });
    } else if (payload.estado === 'Falto') await ensureNoShowSession(cita, { transaction });
    await transaction.commit();
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.json(citaCompleta);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
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
  const transaction = await sequelize.transaction();
  try {
    const cita = await Cita.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!cita) { await transaction.rollback(); return res.status(404).json({ message: 'Cita no encontrada' }); }
    if (!ESTADOS_CITA.includes(req.body.estado)) { await transaction.rollback(); return res.status(400).json({ message: 'estado no es valido' }); }

    await cita.update({ estado: req.body.estado }, { transaction });
    if (['No asistio', 'Cancelada'].includes(req.body.estado)) {
      const cleanup = await cleanupTemporaryWhatsappNoShow(cita, { transaction });
      if (req.body.estado === 'No asistio' && !cleanup.temporary) await ensureNoShowSession(cita, { transaction });
    } else if (req.body.estado === 'Falto') await ensureNoShowSession(cita, { transaction });
    await transaction.commit();
    const citaCompleta = await Cita.findByPk(cita.id, { include: includeCita });
    return res.json(citaCompleta);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const listarCitasPaciente = async (req, res, next) => {
  try {
    await actualizarCitasNoAsistidas();
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
    await actualizarCitasNoAsistidas();
    const citas = await Cita.findAll({
      where: buildFiltros(req.query),
      include: includeCitaAgenda,
      order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']]
    });
    return res.json(citas);
  } catch (error) {
    return next(error);
  }
};

const listarPeriodo = (tipo) => async (req, res, next) => {
  try {
    await actualizarCitasNoAsistidas();
    const hoy = new Date(`${boliviaDate()}T12:00:00-04:00`);
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

    const fechaInicio = boliviaDate(inicio);
    const fechaFin = boliviaDate(fin);
    const citas = await Cita.findAll({
      where: { fecha: { [Op.between]: [fechaInicio, fechaFin] } },
      include: includeCitaAgenda,
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
  , obtenerProgramacionHistoria, validarDisponibilidad, crearProgramacion, validarSolapamiento
};
