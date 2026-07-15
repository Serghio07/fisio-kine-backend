const { Op } = require('sequelize');
const { EvaluacionFinal, HistoriaClinica, Paciente, Personal, Sesion, Usuario, sequelize } = require('../models');
const { sincronizarSemana } = require('../services/sesionSemanalSync.service');

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

const calcularPago = (body) => {
  const estadoPago = body.estado_pago || 'Pendiente';
  const montoSesion = toMoney(body.monto_sesion);
  let montoPagado = toMoney(body.monto_pagado);

  if (estadoPago === 'Pagado') montoPagado = montoSesion;
  if (estadoPago === 'Debe') montoPagado = 0;
  if (estadoPago === 'Pendiente' && !body.monto_pagado) montoPagado = 0;

  return {
    monto_sesion: montoSesion,
    monto_pagado: montoPagado,
    saldo_pendiente: Math.max(montoSesion - montoPagado, 0)
  };
};

const normalizarSesion = (body) => {
  const asistencia = body.asistencia || 'pendiente';
  const sesionesHizo = Number(body.sesiones_hizo || 0);
  const pago = calcularPago(body);

  return {
    paciente_id: body.paciente_id,
    historia_clinica_id: body.historia_clinica_id || null,
    fecha: body.fecha,
    sesiones_debe: Number(body.sesiones_debe || 0),
    sesiones_hizo: sesionesHizo,
    numero_sesion: body.numero_sesion || Math.max(sesionesHizo, 1),
    asistencia,
    metodo_pago: body.metodo_pago || 'Pendiente',
    estado_pago: body.estado_pago || 'Pendiente',
    ...pago,
    aplica_farmacos: Boolean(body.aplica_farmacos),
    observacion_farmacos: body.aplica_farmacos ? body.observacion_farmacos : null,
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
  if (!['QR', 'Efectivo', 'Transferencia', 'Pendiente', 'Otro'].includes(body.metodo_pago || 'Pendiente')) {
    return 'metodo_pago no es valido';
  }
  if (!['Pagado', 'Pendiente', 'Parcial', 'Debe'].includes(body.estado_pago || 'Pendiente')) {
    return 'estado_pago no es válido';
  }
  if (Number(body.monto_sesion || 0) < 0) return 'monto_sesion no puede ser negativo';
  if (Number(body.monto_pagado || 0) < 0) return 'monto_pagado no puede ser negativo';
  return null;
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
  const fechasAfectadas = new Map();

  for (const sesion of sesiones) {
    if (sesion.asistencia === 'asistio') realizadas += 1;
    const numeroSesion = sesion.asistencia === 'asistio' ? realizadas : Math.max(realizadas, 1);

    await sesion.update({
      sesiones_debe: contratadas,
      sesiones_hizo: realizadas,
      numero_sesion: numeroSesion
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
  const transaction = await sequelize.transaction();
  try {
    await recalcularHistoriasConSesiones(transaction);
    await transaction.commit();
    const incluirAnuladas = String(req.query.incluir_anuladas || '').toLowerCase() === 'true';
    const where = incluirAnuladas ? {} : { anulada: false };
    const sesiones = await Sesion.findAll({ where, include: includeSesion, order: [['fecha', 'DESC'], ['id', 'DESC']] });
    return res.json(sesiones);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
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
    if (!paciente) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const basePayload = normalizarSesion(req.body);
    const preparado = await prepararSesionConHistoria(basePayload, transaction);
    if (preparado.error) {
      await transaction.rollback();
      return res.status(400).json({ message: preparado.error });
    }
    const payload = preparado.payload;

    const sesion = await Sesion.create({ ...payload, usuario_id: req.usuario.id }, { transaction });
    const fechasAfectadas = await recalcularProgresoHistoria(payload.historia_clinica_id, transaction);
    await sincronizarFechas(fechasAfectadas, transaction);
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
    const origen = { paciente_id: sesion.paciente_id, fecha: sesion.fecha, historia_clinica_id: sesion.historia_clinica_id };

    const basePayload = normalizarSesion({ ...sesion.toJSON(), ...req.body });
    const preparado = await prepararSesionConHistoria(basePayload, transaction, sesion);
    if (preparado.error) {
      await transaction.rollback();
      return res.status(400).json({ message: preparado.error });
    }
    const payload = preparado.payload;
    const errorValidacion = validarSesion(payload);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    await sesion.update(payload, { transaction });
    const fechasAfectadas = await recalcularProgresoHistoria(payload.historia_clinica_id, transaction);
    if (String(origen.historia_clinica_id) !== String(payload.historia_clinica_id)) {
      fechasAfectadas.push(...await recalcularProgresoHistoria(origen.historia_clinica_id, transaction));
    }
    fechasAfectadas.push({ paciente_id: origen.paciente_id, fecha: origen.fecha });
    await sincronizarFechas(fechasAfectadas, transaction);
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
      observacion_anulacion: req.body.observacion_anulacion || null
    }, { transaction });
    const fechasAfectadas = await recalcularProgresoHistoria(origen.historia_clinica_id, transaction);
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
