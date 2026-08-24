const { Op } = require('sequelize');
const { randomUUID } = require('crypto');
const { Cita, DocumentoClinico, EvaluacionFinal, HistoriaClinica, IntervencionClinica, Paciente, Personal, Sesion, Usuario, sequelize } = require('../models');
const { sincronizarSemana } = require('../services/sesionSemanalSync.service');
const { sincronizarConceptoSesion } = require('../services/planillaPagosSync.service');
const { findAndLockAppointmentForSession, syncAppointmentFromSession } = require('../services/citaSesionLink.service');
const { clinicalPatientEligibilityError } = require('../services/clinicalPatientEligibility.service');
const { enrichRecordsWithAdministrativePhone } = require('../services/patientAdministrativeContact.service');

const includeSesion = [
  { model: Paciente, as: 'paciente' },
  {
    model: HistoriaClinica,
    as: 'historia_clinica',
    include: [{ model: EvaluacionFinal, as: 'evaluacion_final' }]
  },
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

const toMoney = (value) => Math.max(Number(value || 0), 0);
const PROCEDIMIENTOS = [
  'Fisioterapia', 'Kinesiología', 'Atención médica', 'Evaluación fisioterapéutica',
  'Reevaluación', 'Terapia física', 'Rehabilitación', 'Masoterapia', 'Terapia manual',
  'Ejercicio terapéutico', 'Electroterapia', 'Termoterapia', 'Crioterapia',
  'Ultrasonoterapia', 'Hidroterapia', 'Curación', 'Aplicación de medicamentos',
  'Control / seguimiento', 'Valoración médica', 'Procedimiento especial', 'Otro'
];

const calcularPago = (body) => {
  const estadoPago = body.estado_pago || 'Pendiente';
  const montoSesion = estadoPago === 'Sin costo' ? 0 : toMoney(body.monto_sesion);
  let montoPagado = toMoney(body.monto_pagado);

  if (estadoPago === 'Pagado') montoPagado = montoSesion;
  if (['Debe', 'Pendiente', 'Sin costo'].includes(estadoPago)) montoPagado = 0;

  return {
    monto_sesion: montoSesion,
    monto_pagado: montoPagado,
    saldo_pendiente: Math.max(montoSesion - montoPagado, 0)
  };
};

const normalizarFarmacos = (body) => {
  if (body.asistencia !== 'asistio' || !body.aplica_farmacos) return [];
  const ahora = new Date().toISOString();
  return (Array.isArray(body.farmacos) ? body.farmacos : []).map((farmaco) => ({
    id: farmaco.id || randomUUID(),
    nombre: String(farmaco.nombre === 'Otro' ? farmaco.nombre_otro || '' : farmaco.nombre || '').trim(),
    tipo: farmaco.nombre === 'Otro' ? 'Otro' : farmaco.nombre,
    presentacion_dosis: String(farmaco.presentacion_dosis || farmaco.dosis || '').trim(),
    via: String(farmaco.via === 'Otra' ? farmaco.via_otro || '' : farmaco.via || '').trim(),
    tipo_via: farmaco.via === 'Otra' ? 'Otra' : farmaco.via,
    cantidad: Number(farmaco.cantidad),
    precio_unitario: toMoney(farmaco.precio_unitario),
    subtotal: toMoney(farmaco.cantidad) * toMoney(farmaco.precio_unitario),
    motivo_clinico: String(farmaco.motivo_clinico || farmaco.motivo || '').trim(),
    observacion: String(farmaco.observacion || '').trim(),
    estado: 'activo',
    fecha_creacion: farmaco.fecha_creacion || ahora,
    fecha_actualizacion: ahora
  }));
};

const normalizarSesion = (body) => {
  const asistencia = body.asistencia || 'pendiente';
  const sesionesHizo = Number(body.sesiones_hizo || 0);
  const pago = calcularPago(body);
  const farmacos = normalizarFarmacos({ ...body, asistencia });
  const primerFarmaco = farmacos[0];

  return {
    paciente_id: body.paciente_id,
    historia_clinica_id: body.historia_clinica_id || null,
    fecha: body.fecha,
    sesiones_debe: Number(body.sesiones_debe || 0),
    sesiones_hizo: sesionesHizo,
    numero_sesion: body.numero_sesion || Math.max(sesionesHizo, 1),
    asistencia,
    metodo_pago: ['Pendiente', 'Sin costo'].includes(body.estado_pago) ? null : body.metodo_pago || null,
    estado_pago: body.estado_pago || 'Pendiente',
    ...pago,
    aplica_farmacos: farmacos.length > 0,
    observacion_farmacos: farmacos.length ? farmacos.map((item) => item.observacion).filter(Boolean).join(' | ') || null : null,
    farmacos,
    observacion_pago: body.observacion_pago || null,
    motivo_sin_costo: body.estado_pago === 'Sin costo' ? body.motivo_sin_costo || null : null,
    procedimiento: body.procedimiento || null,
    procedimiento_otro: body.procedimiento === 'Otro' ? String(body.procedimiento_otro || '').trim() || null : null,
    medios_fisicos: body.medios_fisicos || null,
    tecnicas_manuales: body.tecnicas_manuales || null,
    descripcion_tratamiento: body.descripcion_tratamiento || null,
    evolucion_observada: body.evolucion_observada || null,
    dolor_antes: body.dolor_antes === '' || body.dolor_antes == null ? null : Number(body.dolor_antes),
    dolor_despues: body.dolor_despues === '' || body.dolor_despues == null ? null : Number(body.dolor_despues),
    inyectable_nombre: primerFarmaco?.nombre || null,
    inyectable_dosis: primerFarmaco?.presentacion_dosis || null,
    profesional_responsable: body.profesional_responsable || null,
    observacion: body.observacion
  };
};

const validarSesion = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.historia_clinica_id) return 'historia_clinica_id es requerido';
  if (!body.fecha) return 'fecha es requerida';
  if (Number(body.sesiones_debe || 0) < 0) return 'sesiones_debe no puede ser negativo';
  if (Number(body.sesiones_hizo || 0) < 0) return 'sesiones_hizo no puede ser negativo';
  if (!['pendiente', 'asistio', 'no_asistio', 'cancelada', 'reprogramada'].includes(body.asistencia || 'pendiente')) {
    return 'asistencia no es valida';
  }
  if (body.metodo_pago && !['QR', 'Efectivo', 'Transferencia', 'Tarjeta', 'Otro'].includes(body.metodo_pago)) {
    return 'metodo_pago no es valido';
  }
  if (!['Pagado', 'Pendiente', 'Parcial', 'Sin costo', 'Debe'].includes(body.estado_pago || 'Pendiente')) {
    return 'estado_pago no es válido';
  }
  if (Number(body.monto_sesion || 0) < 0) return 'monto_sesion no puede ser negativo';
  if (Number(body.monto_pagado || 0) < 0) return 'monto_pagado no puede ser negativo';
  if (body.dolor_antes !== null && body.dolor_antes !== '' && (Number(body.dolor_antes) < 0 || Number(body.dolor_antes) > 10)) return 'dolor_antes debe estar entre 0 y 10';
  if (body.dolor_despues !== null && body.dolor_despues !== '' && (Number(body.dolor_despues) < 0 || Number(body.dolor_despues) > 10)) return 'dolor_despues debe estar entre 0 y 10';
  if (body.asistencia === 'asistio') {
    if (!PROCEDIMIENTOS.includes(body.procedimiento)) return 'Seleccione un procedimiento válido';
    if (body.procedimiento === 'Otro' && !String(body.procedimiento_otro || '').trim()) return 'Especifique el procedimiento realizado';
    if (body.dolor_despues === null || body.dolor_despues === '') return 'dolor_despues es requerido cuando el paciente asistió';
    if (!String(body.descripcion_tratamiento || '').trim()) return 'El procedimiento realizado es requerido cuando el paciente asistió';
  }
  if (body.estado_pago === 'Parcial' && !(Number(body.monto_pagado) > 0 && Number(body.monto_pagado) < Number(body.monto_sesion))) {
    return 'En un pago parcial, el monto pagado debe ser mayor a cero y menor al monto de la sesión';
  }
  if (['Pagado', 'Parcial'].includes(body.estado_pago) && !body.metodo_pago) return 'Seleccione el método de pago';
  if (body.estado_pago === 'Sin costo' && !String(body.motivo_sin_costo || '').trim()) return 'El motivo es requerido para una sesión sin costo';
  if (body.aplica_farmacos) {
    if (body.asistencia !== 'asistio') return 'No se pueden administrar fármacos si el paciente no asistió';
    if (!String(body.descripcion_tratamiento || '').trim() || body.dolor_despues === null || body.dolor_despues === '') {
      return 'Primero registre la evolución clínica del paciente antes de administrar fármacos';
    }
    const farmacos = Array.isArray(body.farmacos) ? body.farmacos : [];
    if (!farmacos.length) return 'Agregue al menos un fármaco';
    for (const farmaco of farmacos) {
      const nombre = String(farmaco.nombre === 'Otro' ? farmaco.nombre_otro || '' : farmaco.nombre || '').trim();
      const dosis = String(farmaco.presentacion_dosis || farmaco.dosis || '').trim();
      const via = String(farmaco.via === 'Otra' ? farmaco.via_otro || '' : farmaco.via || '').trim();
      if (!nombre || !dosis || !via || !(Number(farmaco.cantidad) > 0)) {
        return 'Cada fármaco debe tener nombre, dosis, vía y cantidad mayor a cero';
      }
      if (farmaco.precio_unitario !== '' && farmaco.precio_unitario != null && (!Number.isFinite(Number(farmaco.precio_unitario)) || Number(farmaco.precio_unitario) < 0)) {
        return 'El precio unitario de cada fármaco debe ser un número mayor o igual a cero';
      }
    }
  }
  return null;
};

const sincronizarDocumentoFarmacos = async (sesion, historia, transaction) => {
  const existente = await DocumentoClinico.findOne({ where: { tipo: 'farmacos', sesion_id: sesion.id }, transaction });
  const farmacos = Array.isArray(sesion.farmacos) ? sesion.farmacos : [];
  const activo = !sesion.anulada && sesion.asistencia === 'asistio' && farmacos.length > 0;
  if (!activo) {
    if (existente) {
      const filas = (existente.datos?.filas || []).map((fila) => ({ ...fila, estado: 'Anulado', anulado: true }));
      await existente.update({ estado: 'Anulado', activo: false, datos: { ...existente.datos, filas } }, { transaction });
    }
    return;
  }
  const datosComunes = {
    origen: 'sesion',
    paciente_id: sesion.paciente_id,
    historia_clinica_id: sesion.historia_clinica_id,
    sesion_id: sesion.id,
    fecha: sesion.fecha,
    numero_sesion: sesion.numero_sesion,
    profesional: sesion.profesional_responsable,
    diagnostico: historia?.diagnostico_medico || '',
    resumen_evolucion: sesion.evolucion_observada || sesion.observacion || '',
    procedimiento_realizado: sesion.descripcion_tratamiento || '',
    dolor_inicial: sesion.dolor_antes,
    dolor_final: sesion.dolor_despues,
    estado: 'Guardado',
    anulado: false
  };
  const filas = farmacos.map((farmaco) => ({
    ...datosComunes,
    id: farmaco.id,
    motivo: farmaco.motivo_clinico,
    observaciones: farmaco.observacion,
    via_administracion: farmaco.via,
    productos: [{
      producto: farmaco.tipo === 'Otro' ? 'Otro' : farmaco.nombre,
      nombre_otro: farmaco.tipo === 'Otro' ? farmaco.nombre : '',
      presentacion: farmaco.presentacion_dosis,
      dosis: farmaco.presentacion_dosis,
      volumen: farmaco.presentacion_dosis,
      cantidad: farmaco.cantidad,
      precio_unitario: farmaco.precio_unitario,
      subtotal: farmaco.subtotal,
      via: farmaco.via,
      motivo_clinico: farmaco.motivo_clinico,
      observacion: farmaco.observacion
    }]
  }));
  const payload = {
    tipo: 'farmacos',
    paciente_id: sesion.paciente_id,
    usuario_id: sesion.usuario_id,
    usuario_modificacion_id: sesion.usuario_id,
    sesion_id: sesion.id,
    fecha: sesion.fecha,
    estado: 'Guardado',
    titulo: 'Administración de fármacos',
    descripcion: 'Generado automáticamente desde la evolución clínica de la sesión.',
    datos: { origen: 'sesion', historia_clinica_id: sesion.historia_clinica_id, filas },
    activo: true,
    eliminado: false
  };
  if (existente) await existente.update(payload, { transaction, validate: false });
  else await DocumentoClinico.create(payload, { transaction, validate: false });
};

const sincronizarEvolutivoSesion = async (sesion, transaction) => {
  if (!sesion.historia_clinica_id) return;
  const historia = await HistoriaClinica.findByPk(sesion.historia_clinica_id, { transaction });
  if (!historia) return;
  const anteriores = Array.isArray(historia.evolutivo) ? historia.evolutivo : [];
  const index = anteriores.findIndex((item) => String(item.sesion_id || '') === String(sesion.id));
  if (index < 0 && sesion.asistencia !== 'asistio') return;
  const anterior = index >= 0 ? anteriores[index] : {};
  const tratamiento = [sesion.medios_fisicos, sesion.tecnicas_manuales, sesion.descripcion_tratamiento].filter(Boolean).join(' · ');
  const farmacos = Array.isArray(sesion.farmacos) ? sesion.farmacos : [];
  const inyectable = farmacos.length
    ? farmacos.map((item) => [item.nombre, item.presentacion_dosis, item.via].filter(Boolean).join(' · ')).join(' | ')
    : [sesion.inyectable_nombre, sesion.inyectable_dosis].filter(Boolean).join(' · ');
  const ahora = new Date().toISOString();
  const evolutivo = {
    ...anterior,
    id: anterior.id || randomUUID(),
    sesion_id: sesion.id,
    historia_clinica_id: historia.id,
    paciente_id: sesion.paciente_id,
    numero_sesion: sesion.numero_sesion,
    fecha_sesion: sesion.fecha,
    medios_fisicos: sesion.medios_fisicos,
    tecnicas_manuales: sesion.tecnicas_manuales,
    descripcion_tratamiento: sesion.descripcion_tratamiento,
    procedimiento_realizado: tratamiento || sesion.observacion || null,
    evolucion_observada: sesion.evolucion_observada,
    dolor_inicial: sesion.dolor_antes,
    dolor_final: sesion.dolor_despues,
    inyectable_nombre: sesion.inyectable_nombre,
    inyectable_dosis: sesion.inyectable_dosis,
    farmacos,
    inyectables: inyectable || null,
    observaciones: sesion.observacion,
    profesional_responsable: sesion.profesional_responsable,
    estado: !sesion.anulada && sesion.asistencia === 'asistio' ? 'activo' : 'anulado',
    fecha_creacion: anterior.fecha_creacion || ahora,
    fecha_actualizacion: ahora,
    ...(sesion.anulada ? { fecha_anulacion: ahora } : {})
  };
  const siguientes = [...anteriores];
  if (index >= 0) siguientes[index] = evolutivo;
  else siguientes.push(evolutivo);
  await historia.update({ evolutivo: siguientes }, { transaction });
};

const recalcularCadenaDolor = async (historiaId, transaction) => {
  if (!historiaId) return;
  const historia = await HistoriaClinica.findByPk(historiaId, {
    include: [{ model: IntervencionClinica, as: 'intervencion_clinica' }],
    transaction
  });
  if (!historia) return;

  const sesiones = await Sesion.findAll({
    where: { historia_clinica_id: historiaId, asistencia: 'asistio', anulada: false },
    order: [['numero_sesion', 'ASC'], ['fecha', 'ASC'], ['id', 'ASC']],
    transaction
  });
  let dolorAnterior = historia.intervencion_clinica?.escala_dolor;
  dolorAnterior = dolorAnterior === '' || dolorAnterior == null ? null : Number(dolorAnterior);

  for (const sesion of sesiones) {
    if (sesion.dolor_antes !== dolorAnterior) {
      await sesion.update({ dolor_antes: dolorAnterior }, { transaction });
    }
    await sincronizarEvolutivoSesion(sesion, transaction);
    if (sesion.dolor_despues !== '' && sesion.dolor_despues != null) {
      dolorAnterior = Number(sesion.dolor_despues);
    }
  }
};

const anularEvolutivoEnHistoria = async (historiaId, sesionId, transaction) => {
  if (!historiaId) return;
  const historia = await HistoriaClinica.findByPk(historiaId, { transaction });
  if (!historia || !Array.isArray(historia.evolutivo)) return;
  let cambio = false;
  const ahora = new Date().toISOString();
  const siguientes = historia.evolutivo.map((item) => {
    if (String(item.sesion_id || '') !== String(sesionId)) return item;
    cambio = true;
    return { ...item, estado: 'anulado', fecha_anulacion: ahora, fecha_actualizacion: ahora };
  });
  if (cambio) await historia.update({ evolutivo: siguientes }, { transaction });
};

const contarSesionesValidas = async (historiaClinicaId, transaction, excludeId = null) => {
  const where = {
    historia_clinica_id: historiaClinicaId,
    asistencia: 'asistio',
    anulada: false
  };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  return Sesion.count({ where, transaction });
};

const recalcularProgresoHistoria = async (historiaClinicaId, transaction) => {
  if (!historiaClinicaId) return [];

  const historia = await HistoriaClinica.findByPk(historiaClinicaId, {
    include: [{ model: EvaluacionFinal, as: 'evaluacion_final' }],
    transaction
  });
  if (!historia) return [];

  const contratadas = Number(historia.evaluacion_final?.sesiones_contratadas || 0);
  const sesiones = await Sesion.findAll({
    where: {
      historia_clinica_id: historiaClinicaId,
      anulada: false
    },
    order: [['fecha', 'ASC'], ['id', 'ASC']],
    transaction
  });

  let realizadas = 0;
  let numeroCronologico = 0;
  const fechasAfectadas = new Map();

  for (const sesion of sesiones) {
    numeroCronologico += 1;
    if (sesion.asistencia === 'asistio') realizadas += 1;

    await sesion.update({
      sesiones_debe: contratadas,
      sesiones_hizo: realizadas,
      numero_sesion: numeroCronologico
    }, { transaction });

    fechasAfectadas.set(`${sesion.paciente_id}:${sesion.fecha}`, {
      paciente_id: sesion.paciente_id,
      fecha: sesion.fecha
    });
  }

  return [...fechasAfectadas.values()];
};

const sincronizarFechas = async (fechas, transaction) => {
  const unique = new Map(fechas.map((item) => [`${item.paciente_id}:${item.fecha}`, item]));
  for (const item of unique.values()) {
    await sincronizarSemana(item.paciente_id, item.fecha, transaction);
  }
};

const recalcularHistoriasConSesiones = async (transaction) => {
  const sesiones = await Sesion.findAll({
    attributes: ['historia_clinica_id'],
    where: {
      historia_clinica_id: { [Op.ne]: null },
      anulada: false
    },
    group: ['historia_clinica_id'],
    transaction
  });

  for (const sesion of sesiones) {
    await recalcularProgresoHistoria(sesion.historia_clinica_id, transaction);
    await recalcularCadenaDolor(sesion.historia_clinica_id, transaction);
  }
};

const prepararSesionConHistoria = async (payload, transaction, sesionActual = null) => {
  const historia = await HistoriaClinica.findByPk(payload.historia_clinica_id, {
    include: [{ model: EvaluacionFinal, as: 'evaluacion_final' }],
    transaction
  });
  if (!historia) return { error: 'Historia clinica no encontrada' };
  if (String(historia.paciente_id) !== String(payload.paciente_id)) return { error: 'La historia clinica no pertenece al paciente seleccionado' };
  if (historia.estado === 'anulada' || historia.anulada) return { error: 'No se pueden registrar sesiones en una historia clinica anulada' };

  const contratadas = Number(historia.evaluacion_final?.sesiones_contratadas || 0);
  if (contratadas <= 0) return { error: 'La historia clinica no tiene sesiones indicadas registradas' };

  const cuentaActual = await contarSesionesValidas(historia.id, transaction, sesionActual?.id);
  const cuentaEstaSesion = payload.asistencia === 'asistio' ? 1 : 0;
  const realizadas = cuentaActual + cuentaEstaSesion;

  if (cuentaEstaSesion && realizadas > contratadas) {
    return { error: 'No quedan sesiones restantes para esta historia clinica' };
  }

  return {
    payload: {
      ...payload,
      sesiones_debe: contratadas,
      sesiones_hizo: realizadas,
      numero_sesion: cuentaEstaSesion ? realizadas : Number(payload.numero_sesion || Math.max(cuentaActual, 1))
    }
  };
};

const listarSesiones = async (req, res, next) => {
  try {
    const incluirAnuladas = String(req.query.incluir_anuladas || '').toLowerCase() === 'true';
    const where = incluirAnuladas ? {} : { anulada: false };
    const resumen = String(req.query.resumen || '').toLowerCase() === 'true';
    const sesiones = await Sesion.findAll({
      where,
      include: resumen ? [] : includeSesion,
      order: [['fecha', 'DESC'], ['id', 'DESC']]
    });
    // Normaliza la respuesta sin escribir en la base de datos. Esto corrige de
    // inmediato registros históricos que quedaron repetidos como "Sesión 1".
    const numeroPorId = new Map();
    const porHistoria = new Map();
    sesiones.filter((sesion) => !sesion.anulada).forEach((sesion) => {
      const key = String(sesion.historia_clinica_id || `sin-historia-${sesion.paciente_id}`);
      if (!porHistoria.has(key)) porHistoria.set(key, []);
      porHistoria.get(key).push(sesion);
    });
    porHistoria.forEach((items) => items
      .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')) || Number(a.id) - Number(b.id))
      .forEach((sesion, index) => numeroPorId.set(String(sesion.id), index + 1)));
    const normalized = sesiones.map((sesion) => ({
      ...sesion.toJSON(),
      numero_sesion: numeroPorId.get(String(sesion.id)) || sesion.numero_sesion
    }));
    return res.json(await enrichRecordsWithAdministrativePhone(normalized));
  } catch (error) {
    return next(error);
  }
};

const obtenerSesion = async (req, res, next) => {
  try {
    const sesion = await Sesion.findByPk(req.params.id, { include: includeSesion });
    if (!sesion) return res.status(404).json({ message: 'Sesion no encontrada' });
    return res.json(await enrichRecordsWithAdministrativePhone(sesion));
  } catch (error) {
    return next(error);
  }
};

const nombreProfesional = (usuario) => {
  const ficha = usuario?.ficha_personal;
  const nombreFicha = [ficha?.titulo_profesional, ficha?.nombres, ficha?.apellido_paterno, ficha?.apellido_materno].filter(Boolean).join(' ');
  return nombreFicha || usuario?.nombre || usuario?.usuario || 'Usuario del sistema';
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
    const pacienteError = clinicalPatientEligibilityError(paciente);
    if (pacienteError) {
      await transaction.rollback();
      return res.status(pacienteError.status).json({ message: pacienteError.message });
    }

    await sequelize.query('SELECT pg_advisory_xact_lock(:paciente, :historia)', {
      replacements: {
        paciente: Number(req.body.paciente_id),
        historia: Number(req.body.historia_clinica_id)
      },
      transaction
    });

    let programacion = null;
    if (req.body.cita_id) {
      programacion = await Cita.findOne({
        where: { id: req.body.cita_id, paciente_id: req.body.paciente_id, historia_clinica_id: req.body.historia_clinica_id },
        transaction, lock: transaction.LOCK.UPDATE
      });
      if (!programacion || !['Programada', 'Confirmada'].includes(programacion.estado)) {
        await transaction.rollback();
        return res.status(409).json({ message: 'La programacion no existe, ya fue atendida o no pertenece a esta historia clinica' });
      }
      if (programacion.sesion_id) {
        await transaction.rollback();
        return res.status(409).json({ message: 'Esta programacion ya tiene una sesion clinica registrada' });
      }
    }
    const basePayload = normalizarSesion({
      ...req.body,
      fecha: programacion?.fecha || req.body.fecha,
      numero_sesion: programacion?.numero_sesion || req.body.numero_sesion,
      profesional_responsable: req.body.profesional_responsable || nombreProfesional(req.usuario)
    });
    const preparado = await prepararSesionConHistoria(basePayload, transaction);
    if (preparado.error) {
      await transaction.rollback();
      return res.status(400).json({ message: preparado.error });
    }
    const payload = { ...preparado.payload, numero_sesion: programacion?.numero_sesion || preparado.payload.numero_sesion };
    if (!programacion) programacion = await findAndLockAppointmentForSession(payload, { transaction });
    const duplicada = await Sesion.findOne({
      where: {
        paciente_id: payload.paciente_id,
        historia_clinica_id: payload.historia_clinica_id,
        fecha: payload.fecha,
        numero_sesion: payload.numero_sesion,
        anulada: false
      },
      transaction
    });
    if (duplicada) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Esta sesión ya fue registrada. Edite el registro existente en lugar de crear otro.' });
    }

    const sesion = await Sesion.create({ ...payload, usuario_id: req.usuario.id }, { transaction });
    if (programacion) {
      await programacion.update({
        sesion_id: sesion.id,
        estado: payload.asistencia === 'asistio' ? 'Atendida' : payload.asistencia === 'no_asistio' ? 'Falto' : programacion.estado
      }, { transaction });
    }
    const fechasAfectadas = await recalcularProgresoHistoria(payload.historia_clinica_id, transaction);
    await sesion.reload({ transaction });
    await sincronizarConceptoSesion(sesion, transaction, { importarPago: true });
    await recalcularCadenaDolor(payload.historia_clinica_id, transaction);
    await sesion.reload({ transaction });
    const historiaFarmacos = await HistoriaClinica.findByPk(payload.historia_clinica_id, { transaction });
    await sincronizarDocumentoFarmacos(sesion, historiaFarmacos, transaction);
    await sincronizarFechas(fechasAfectadas, transaction);
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includeSesion, transaction });
    await transaction.commit();
    return res.status(201).json(await enrichRecordsWithAdministrativePhone({
      ...sesionCompleta.toJSON(),
      sincronizacion_semanal: true
    }));
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
    const origen = { paciente_id: sesion.paciente_id, fecha: sesion.fecha, historia_clinica_id: sesion.historia_clinica_id };

    const mergedBody = { ...sesion.toJSON(), ...req.body };
    const basePayload = normalizarSesion({ ...mergedBody, profesional_responsable: mergedBody.profesional_responsable || nombreProfesional(req.usuario) });
    const preparado = await prepararSesionConHistoria(basePayload, transaction, sesion);
    if (preparado.error) {
      await transaction.rollback();
      return res.status(400).json({ message: preparado.error });
    }
    const payload = preparado.payload;
    const paciente = await Paciente.findByPk(payload.paciente_id, { transaction });
    const pacienteError = clinicalPatientEligibilityError(paciente);
    if (pacienteError) {
      await transaction.rollback();
      return res.status(pacienteError.status).json({ message: pacienteError.message });
    }
    const errorValidacion = validarSesion(payload);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    await sesion.update(payload, { transaction });
    await syncAppointmentFromSession(sesion, { transaction });
    const fechasAfectadas = await recalcularProgresoHistoria(payload.historia_clinica_id, transaction);
    if (String(origen.historia_clinica_id) !== String(payload.historia_clinica_id)) {
      fechasAfectadas.push(...await recalcularProgresoHistoria(origen.historia_clinica_id, transaction));
      await anularEvolutivoEnHistoria(origen.historia_clinica_id, sesion.id, transaction);
    }
    fechasAfectadas.push({ paciente_id: origen.paciente_id, fecha: origen.fecha });
    await sincronizarFechas(fechasAfectadas, transaction);
    if (String(origen.paciente_id) !== String(payload.paciente_id) || origen.fecha !== payload.fecha) {
      await sincronizarSemana(payload.paciente_id, payload.fecha, transaction);
    }
    await sesion.reload({ transaction });
    if (req.usuario.rol === 'admin') {
      // Si el pago fue registrado desde Sesiones, la planilla debe recibir el
      // movimiento que lo respalda. El servicio evita duplicarlo cuando ya existe.
      await sincronizarConceptoSesion(sesion, transaction, { importarPago: true });
    }
    await recalcularCadenaDolor(payload.historia_clinica_id, transaction);
    if (String(origen.historia_clinica_id) !== String(payload.historia_clinica_id)) {
      await recalcularCadenaDolor(origen.historia_clinica_id, transaction);
    }
    await sesion.reload({ transaction });
    const historiaFarmacos = await HistoriaClinica.findByPk(payload.historia_clinica_id, { transaction });
    await sincronizarDocumentoFarmacos(sesion, historiaFarmacos, transaction);
    const sesionCompleta = await Sesion.findByPk(sesion.id, { include: includeSesion, transaction });
    await transaction.commit();
    return res.json(await enrichRecordsWithAdministrativePhone({
      ...sesionCompleta.toJSON(),
      sincronizacion_semanal: true
    }));
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
    if (sesion.anulada) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La sesion ya esta anulada' });
    }
    if (!req.body?.motivo_anulacion) {
      await transaction.rollback();
      return res.status(400).json({ message: 'motivo_anulacion es requerido' });
    }
    const origen = { paciente_id: sesion.paciente_id, fecha: sesion.fecha, historia_clinica_id: sesion.historia_clinica_id };

    await sesion.update({
      anulada: true,
      anulada_en: new Date(),
      anulada_por: nombreProfesional(req.usuario),
      motivo_anulacion: req.body.motivo_anulacion,
      observacion_anulacion: req.body.observacion_anulacion || null,
      farmacos: (Array.isArray(sesion.farmacos) ? sesion.farmacos : []).map((farmaco) => ({
        ...farmaco,
        estado: 'anulado',
        motivo_anulacion: req.body.motivo_anulacion,
        fecha_actualizacion: new Date().toISOString()
      }))
    }, { transaction });
    await sesion.reload({ transaction });
    await sincronizarConceptoSesion(sesion, transaction);
    await sincronizarEvolutivoSesion(sesion, transaction);
    const historiaFarmacos = await HistoriaClinica.findByPk(origen.historia_clinica_id, { transaction });
    await sincronizarDocumentoFarmacos(sesion, historiaFarmacos, transaction);
    const fechasAfectadas = await recalcularProgresoHistoria(origen.historia_clinica_id, transaction);
    await recalcularCadenaDolor(origen.historia_clinica_id, transaction);
    fechasAfectadas.push({ paciente_id: origen.paciente_id, fecha: origen.fecha });
    await sincronizarFechas(fechasAfectadas, transaction);
    await transaction.commit();
    return res.json({
      message: 'Sesion anulada correctamente',
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
