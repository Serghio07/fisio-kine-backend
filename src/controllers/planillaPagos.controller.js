const { Op } = require('sequelize');
const {
  ActividadSistema,
  ArqueoPago,
  ConceptoCobro,
  HistoriaClinica,
  MovimientoPago,
  MovimientoPagoAuditoria,
  MovimientoCaja,
  OperacionPago,
  Paciente,
  Sesion,
  Usuario,
  sequelize
} = require('../models');
const movimientoCajaService = require('../services/movimientoCaja.service');
const arqueoCajaService = require('../services/arqueoCaja.service');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');
const { enrichRecordsWithAdministrativePhone, patientDtoWithAdministrativePhone } = require('../services/patientAdministrativeContact.service');
const { calculatePaymentState, validMoneyAmount } = require('../services/paymentFinancialState.service');
const { validatePaymentOperation } = require('../services/paymentOperationIntegrity.service');
const { financialPeriods, buildPatientFinancialSummary } = require('../services/patientFinancialSummary.service');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validMethods = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const today = () => boliviaDate();
const nowTime = () => boliviaTime();
const newReceipt = () => `REC-${boliviaDate().slice(0, 4)}-${String(Date.now()).slice(-8)}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
const validatePaymentInput = async (body, authenticatedUserId, transaction) => {
  if (!validMoneyAmount(body.monto) || !validMethods.includes(body.metodo)) throw Object.assign(new Error('Ingrese un monto válido, con máximo dos decimales, y un método permitido.'), { status: 400 });
  if (body.fecha && body.fecha > today()) throw Object.assign(new Error('No se pueden registrar pagos con fecha futura.'), { status: 400 });
  const receiverId = body.usuario_receptor_id || authenticatedUserId;
  const receiver = await Usuario.findOne({ where: { id: receiverId, activo: true, estado: 'activo' }, transaction });
  if (!receiver) throw Object.assign(new Error('El usuario receptor no existe o no está activo.'), { status: 400 });
  return { monto: money(body.monto), receiverId };
};

const includeConcepto = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico', 'estado', 'anulada'] },
  { model: Sesion, as: 'sesion' },
  {
    model: MovimientoPago,
    as: 'movimientos',
    required: false,
    include: [
      { model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre', 'usuario'] },
      { model: ArqueoPago, as: 'arqueo', attributes: ['id', 'numero_arqueo', 'estado'] }
      , { model: OperacionPago, as: 'operacion_pago', required: false }
    ]
  }
];
const includePatientFinancialSummary = [
  { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico'] },
  { model: Sesion, as: 'sesion', attributes: ['id', 'numero_sesion', 'fecha'] },
  { model: MovimientoPago, as: 'movimientos', required: false,
    attributes: ['id', 'operacion_pago_id', 'fecha', 'hora', 'monto', 'metodo', 'numero_recibo', 'numero_comprobante', 'archivo_comprobante', 'estado'],
    include: [
      { model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre'] },
      { model: OperacionPago, as: 'operacion_pago', required: false, attributes: ['id', 'fecha', 'hora', 'monto_total', 'metodo', 'numero_recibo', 'numero_comprobante', 'archivo_comprobante', 'tipo', 'estado'] }
    ] }
];

const resumenConcepto = (concepto) => {
  const json = concepto.toJSON ? concepto.toJSON() : concepto;
  const activos = (json.movimientos || []).filter((item) => item.estado === 'Activo');
  const totalPagado = money(activos.reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const financial = calculatePaymentState(json, totalPagado);
  const ultimo = [...activos].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))[0];
  return {
    ...json,
    total_pagado: totalPagado,
    saldo_pendiente: financial.saldo,
    monto_esperado_cobrable: financial.esperado_cobrable,
    estado: financial.estado,
    ultimo_metodo: ultimo?.metodo || 'Sin pago',
    ultimo_pago: ultimo?.fecha || null,
    movimientos: [...(json.movimientos || [])].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))
  };
};

const sincronizarSesion = async (conceptoId, transaction) => {
  const concepto = await ConceptoCobro.findByPk(conceptoId, {
    include: [{ model: MovimientoPago, as: 'movimientos', required: false }],
    transaction
  });
  if (!concepto) return null;
  const resumen = resumenConcepto(concepto);
  await concepto.update({ estado: resumen.estado }, { transaction });
  if (concepto.sesion_id) {
    const metodoSesion = ['Efectivo', 'QR', 'Transferencia', 'Otro'].includes(resumen.ultimo_metodo) ? resumen.ultimo_metodo : resumen.ultimo_metodo === 'Sin pago' ? 'Pendiente' : 'Otro';
    const estadoSesion = resumen.estado === 'Saldo a favor' ? 'Pagado' : resumen.estado === 'Exonerado' ? 'Pagado' : resumen.estado;
    await Sesion.update({
      monto_sesion: concepto.monto_esperado,
      monto_pagado: resumen.total_pagado,
      saldo_pendiente: resumen.saldo_pendiente,
      estado_pago: ['Pagado', 'Parcial', 'Pendiente'].includes(estadoSesion) ? estadoSesion : 'Pendiente',
      metodo_pago: metodoSesion
    }, { where: { id: concepto.sesion_id }, transaction, hooks: false, validate: false });
  }
  return resumen;
};

const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const inRange = (date, query) => (!query.desde || date >= query.desde) && (!query.hasta || date <= query.hasta);

const withPeriodData = (item, query) => {
  const periodMovements = item.movimientos.filter((movement) => movement.estado === 'Activo' && inRange(movement.fecha, query));
  const latest = [...periodMovements].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))[0] || null;
  return { ...item, fecha_concepto: item.fecha_origen, pagado_acumulado: item.total_pagado,
    pagado_periodo: money(periodMovements.reduce((sum, movement) => sum + Number(movement.monto), 0)),
    tiene_pago_periodo: periodMovements.length > 0, ultimo_pago_periodo: latest,
    metodos_periodo: [...new Set(periodMovements.map((movement) => movement.metodo))],
    receptores_periodo: [...new Set(periodMovements.map((movement) => movement.usuario_receptor_id))],
    visible_periodo: inRange(item.fecha_origen, query) || periodMovements.length > 0 };
};

const matches = (item, query) => {
  const searchWords = normalizeSearch(query.buscar).split(/\s+/).filter(Boolean);
  if (!item.visible_periodo) return false;
  if (query.estado && query.estado !== 'Todos' && item.estado !== query.estado) return false;
  if (query.deuda === 'true' && item.saldo_pendiente <= 0) return false;
  if (query.metodo && query.metodo !== 'Todos' && !item.metodos_periodo.includes(query.metodo)) return false;
  if (query.receptor && !item.receptores_periodo.some((id) => String(id) === String(query.receptor))) return false;
  if (!searchWords.length) return true;
  const responsible = item.paciente?.responsable_principal;
  const text = normalizeSearch([item.paciente?.nombres, item.paciente?.apellidos, item.paciente?.tipo_documento, item.paciente?.numero_documento, item.paciente?.ci, item.paciente?.telefono, item.paciente?.telefono_administrativo, responsible?.nombres, responsible?.apellidos, item.historia_clinica?.id, item.historia_clinica?.diagnostico_medico, item.sesion?.numero_sesion, item.detalle, ...item.movimientos.flatMap((m) => [m.numero_recibo, m.numero_comprobante, m.observacion, m.operacion_pago?.numero_recibo, m.operacion_pago?.numero_comprobante, m.operacion_pago?.observacion])].filter(Boolean).join(' '));
  return searchWords.every((word) => text.includes(word));
};

const buildIndicators = (items) => {
  const active = items.filter((item) => item.estado !== 'Anulado' && !item.exonerado);
  const movements = active.flatMap((item) => item.movimientos.filter((m) => m.estado === 'Activo'));
  const byMethod = (method) => money(movements.filter((m) => m.metodo === method).reduce((sum, m) => sum + Number(m.monto), 0));
  return {
    total_esperado: money(active.reduce((sum, item) => sum + Number(item.monto_esperado), 0)),
    total_cobrado: money(movements.reduce((sum, item) => sum + Number(item.monto), 0)),
    cobrado_periodo: money(active.reduce((sum, item) => sum + Number(item.pagado_periodo || 0), 0)),
    total_pendiente: money(active.reduce((sum, item) => sum + item.saldo_pendiente, 0)),
    efectivo: byMethod('Efectivo'), qr: byMethod('QR'), transferencia: byMethod('Transferencia'), tarjeta: byMethod('Tarjeta'),
    pacientes_deuda: new Set(active.filter((item) => item.saldo_pendiente > 0).map((item) => `${item.paciente_id}:${item.historia_clinica_id || 'sin-historia'}`)).size,
    parciales: active.filter((item) => item.estado === 'Parcial').length,
    pendientes: active.filter((item) => item.estado === 'Pendiente').length,
    movimientos: movements.length
  };
};

const buildOperations = (concepts, query) => {
  const operations = new Map(); const legacy = [];
  for (const concept of concepts) for (const movement of concept.movimientos) {
    if (movement.operacion_pago_id && movement.operacion_pago) {
      const key = String(movement.operacion_pago_id);
      const current = operations.get(key) || { ...movement.operacion_pago, legacy: false, paciente: concept.paciente, historia_clinica: concept.historia_clinica, recibido_por: movement.recibido_por, aplicaciones: [] };
      current.aplicaciones.push({ ...movement, concepto: { id: concept.id, detalle: concept.detalle, monto_esperado: concept.monto_esperado, sesion: concept.sesion } }); operations.set(key, current);
    } else if (movement.numero_recibo) legacy.push({ id: `legacy-${movement.id}`, movimiento_id: movement.id, legacy: true, paciente: concept.paciente, historia_clinica: concept.historia_clinica,
      fecha: movement.fecha, hora: movement.hora, monto_total: movement.monto, metodo: movement.metodo, recibido_por: movement.recibido_por, usuario_receptor_id: movement.usuario_receptor_id,
      numero_recibo: movement.numero_recibo, numero_comprobante: movement.numero_comprobante, archivo_comprobante: movement.archivo_comprobante, observacion: movement.observacion,
      tipo: 'LEGACY', estado: movement.estado === 'Anulado' ? 'ANULADA' : 'ACTIVA', anulado_en: movement.anulado_en, motivo_anulacion: movement.motivo_anulacion,
      aplicaciones: [{ ...movement, concepto: { id: concept.id, detalle: concept.detalle, monto_esperado: concept.monto_esperado, sesion: concept.sesion } }] });
  }
  const searchWords = normalizeSearch(query.buscar).split(/\s+/).filter(Boolean);
  return [...operations.values(), ...legacy].filter((operation) => {
    if (!inRange(operation.fecha, query)) return false;
    if (query.metodo && query.metodo !== 'Todos' && operation.metodo !== query.metodo) return false;
    if (query.receptor && String(operation.usuario_receptor_id) !== String(query.receptor)) return false;
    const text = normalizeSearch([operation.numero_recibo, operation.numero_comprobante, operation.observacion, operation.paciente?.nombres, operation.paciente?.apellidos, operation.historia_clinica?.id, ...operation.aplicaciones.map((item) => item.concepto?.detalle)].filter(Boolean).join(' '));
    return searchWords.every((word) => text.includes(word));
  }).sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`));
};

exports.listar = async (req, res, next) => {
  try {
    if (req.query.desde && req.query.hasta && req.query.desde > req.query.hasta) return res.status(400).json({ message: 'La fecha desde no puede ser posterior a la fecha hasta.' });
    const rows = await ConceptoCobro.findAll({ include: includeConcepto, order: [['fecha_origen', 'DESC'], ['id', 'DESC']] });
    const enriched = await enrichRecordsWithAdministrativePhone(rows.map(resumenConcepto));
    const projected = enriched.map((item) => withPeriodData(item, req.query));
    const items = projected.filter((item) => matches(item, req.query));
    res.json({ items, operaciones: buildOperations(projected, req.query), indicadores: buildIndicators(items) });
  } catch (error) { next(error); }
};

exports.resumenFinanciero = async (req, res, next) => {
  try {
    const desde = req.query.fecha_inicio || today();
    const hasta = req.query.fecha_fin || desde;
    if (desde > hasta) return res.status(400).json({ message: 'La fecha inicial no puede ser posterior a la fecha final.' });
    const rows = await ConceptoCobro.findAll({ include: includeConcepto, order: [['fecha_origen', 'DESC'], ['id', 'DESC']] });
    const concepts = rows.map(resumenConcepto).filter((item) => item.estado !== 'Anulado');
    const periodMovements = concepts.flatMap((concept) => concept.movimientos
      .filter((movement) => movement.estado === 'Activo' && movement.fecha >= desde && movement.fecha <= hasta)
      .map((movement) => ({ ...movement, concept })));
    const totalCobrado = money(periodMovements.reduce((sum, item) => sum + Number(item.monto), 0));
    const methodNames = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
    const metodosPago = methodNames.map((metodo) => {
      const monto = money(periodMovements.filter((item) => (methodNames.includes(item.metodo) ? item.metodo : 'Otro') === metodo).reduce((sum, item) => sum + Number(item.monto), 0));
      return { metodo, monto, porcentaje: totalCobrado > 0 ? money((monto / totalCobrado) * 100) : 0 };
    });
    const debtRows = concepts.filter((item) => item.saldo_pendiente > 0).map((item) => ({
      concepto_id: item.id, paciente_id: item.paciente_id, paciente: `${item.paciente?.nombres || ''} ${item.paciente?.apellidos || ''}`.trim() || 'Paciente no disponible',
      historia_id: item.historia_clinica_id, historia: item.historia_clinica?.id ? `Historia ${item.historia_clinica.fecha_evaluacion}` : 'Sin historia clínica',
      concepto: item.detalle, esperado: money(item.monto_esperado), pagado: money(item.total_pagado), saldo: money(item.saldo_pendiente)
    }));
    const groupedDebts = new Map();
    for (const item of debtRows) {
      const key = `${item.paciente_id || 'sin-paciente'}:${item.historia_id || 'sin-historia'}`;
      const current = groupedDebts.get(key) || { ...item, concepto: 'Varios conceptos', esperado: 0, pagado: 0, saldo: 0 };
      current.esperado = money(current.esperado + item.esperado); current.pagado = money(current.pagado + item.pagado); current.saldo = money(current.saldo + item.saldo);
      groupedDebts.set(key, current);
    }
    const debts = [...groupedDebts.values()].sort((a, b) => b.saldo - a.saldo);
    const latestArqueo = await ArqueoPago.findOne({ where: { fecha_operativa: hasta }, include: [{ model: Usuario, as: 'responsable', attributes: ['nombre'] }], order: [['id', 'DESC']] });
    const recentPayments = [...periodMovements].map((item) => ({
      id: item.id, fecha: item.fecha, hora: item.hora, paciente: `${item.concept.paciente?.nombres || ''} ${item.concept.paciente?.apellidos || ''}`.trim(),
      historia: item.concept.historia_clinica?.id ? `Historia ${item.concept.historia_clinica.fecha_evaluacion}` : null, concepto: item.concept.detalle,
      sesion: item.concept.sesion?.numero_sesion || null, esperado: item.concept.monto_esperado, pagado: item.concept.total_pagado, saldo: item.concept.saldo_pendiente,
      metodo: item.metodo, monto: money(item.monto), estado: item.estado, recibido_por: item.recibido_por?.nombre || null,
      arqueo: item.arqueo || null, observacion: item.observacion || null, comprobante: item.numero_comprobante || null, origen: 'PAGO_PACIENTE'
    }));
    const [cashSummary, cashRows] = await Promise.all([
      movimientoCajaService.resumen({ desde, hasta }),
      MovimientoCaja.findAll({ where: { fecha: { [Op.between]: [desde, hasta] } }, include: [{ model: Usuario, as: 'registradoPor', attributes: ['nombre'] }], order: [['fecha', 'DESC'], ['hora', 'DESC']], limit: 10 })
    ]);
    const recentCash = cashRows.map((item) => ({ id: item.id, fecha: item.fecha, hora: item.hora, paciente: 'Movimiento de caja', historia: null,
      concepto: item.concepto, metodo: item.metodo, monto: money(item.monto), estado: item.estado, recibido_por: item.registradoPor?.nombre || null,
      observacion: item.descripcion || item.motivo || null, comprobante: item.comprobante || null, origen: 'MOVIMIENTO_CAJA', tipo_movimiento: item.tipo_movimiento
    }));
    const recent = [...recentPayments, ...recentCash].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`)).slice(0, 10);
    res.json({ periodo: { fecha_inicio: desde, fecha_fin: hasta }, total_cobrado: totalCobrado,
      total_pendiente: money(debts.reduce((sum, item) => sum + item.saldo, 0)), pacientes_con_deuda: new Set(debts.map((item) => item.paciente_id)).size,
      movimientos_periodo: periodMovements.length, estado_arqueo: !latestArqueo ? 'Sin iniciar' : latestArqueo.estado === 'Cerrado' ? `Cerrado — ${latestArqueo.resultado_cierre === 'CON_DIFERENCIA' ? 'Con diferencia' : 'Cuadrado'}` : latestArqueo.estado, arqueo: latestArqueo,
      ingresos_extraordinarios: cashSummary.ingresos_extraordinarios, egresos: cashSummary.egresos, aportes: cashSummary.aportes,
      retiros: cashSummary.retiros, resultado_neto_operativo: cashSummary.resultado_neto,
      saldo_caja: cashSummary.saldo_caja, apertura_pendiente: cashSummary.detalle_saldo.apertura_pendiente,
      metodos_pago: metodosPago, deuda_por_paciente: debts.slice(0, 5), movimientos_recientes: recent });
  } catch (error) { next(error); }
};

exports.resumenFinancieroPaciente = async (req, res, next) => {
  try {
    const pacienteId = Number(req.params.pacienteId);
    const historiaId = req.query.historiaId === undefined || req.query.historiaId === '' ? null : Number(req.query.historiaId);
    if (!Number.isInteger(pacienteId) || pacienteId <= 0) return res.status(400).json({ message: 'El paciente no es válido.' });
    if (historiaId !== null && (!Number.isInteger(historiaId) || historiaId <= 0)) return res.status(400).json({ message: 'La historia clínica no es válida.' });
    const paciente = await Paciente.findByPk(pacienteId);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const historias = await HistoriaClinica.findAll({
      where: { paciente_id: pacienteId },
      attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico', 'estado', 'anulada'],
      order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
    });
    if (historiaId !== null && !historias.some((historia) => historia.id === historiaId)) return res.status(404).json({ message: 'La historia clínica no pertenece al paciente.' });
    const scope = { paciente_id: pacienteId, ...(historiaId !== null ? { historia_clinica_id: historiaId } : {}) };
    const [concepts, sessionsPerformed, patientDto] = await Promise.all([
      ConceptoCobro.findAll({ where: scope, include: includePatientFinancialSummary, order: [['fecha_origen', 'ASC'], ['id', 'ASC']] }),
      Sesion.count({ where: { ...scope, asistencia: 'asistio', anulada: false } }),
      patientDtoWithAdministrativePhone(paciente)
    ]);
    const periods = financialPeriods(today());
    const selectedHistory = historiaId === null ? null : historias.find((historia) => historia.id === historiaId)?.toJSON();
    res.json({
      paciente: {
        id: patientDto.id,
        nombre: `${patientDto.nombres || ''} ${patientDto.apellidos || ''}`.trim(),
        tipo_documento: patientDto.tipo_documento || null,
        numero_documento: patientDto.numero_documento || patientDto.ci || null,
        telefono: patientDto.telefono_administrativo || patientDto.telefono_personal || null,
        telefono_fuente: patientDto.telefono_fuente || null
      },
      historia: selectedHistory,
      historias_disponibles: historias.map((historia) => historia.toJSON()),
      periodos: periods,
      ...buildPatientFinancialSummary({ concepts, sessionsPerformed, periods })
    });
  } catch (error) { next(error); }
};

exports.crearConcepto = async (req, res, next) => {
  try {
    if (!req.body.paciente_id || !req.body.fecha_origen || !req.body.detalle) return res.status(400).json({ message: 'Paciente, fecha y concepto son obligatorios.' });
    const expected = Number(req.body.monto_esperado);
    if (!Number.isFinite(expected) || expected < 0 || !/^\d+(\.\d{1,2})?$/.test(String(req.body.monto_esperado).trim())) return res.status(400).json({ message: 'El monto esperado debe ser válido, no negativo y tener máximo dos decimales.' });
    const concepto = await ConceptoCobro.create({ ...req.body, monto_esperado: money(req.body.monto_esperado), estado: req.body.exonerado ? 'Exonerado' : 'Pendiente' });
    res.status(201).json({ message: 'Concepto de cobro registrado correctamente.', concepto });
  } catch (error) { next(error); }
};

exports.registrarMovimiento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const concepto = await ConceptoCobro.findByPk(req.params.conceptoId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!concepto || !concepto.activo) throw Object.assign(new Error('Concepto de cobro no disponible.'), { status: 404 });
    const { monto, receiverId } = await validatePaymentInput(req.body, req.usuario.id, transaction);
    const movimientosActuales = await MovimientoPago.findAll({ where: { concepto_cobro_id: concepto.id }, transaction });
    const actual = resumenConcepto({ ...concepto.toJSON(), movimientos: movimientosActuales.map((item) => item.toJSON()) });
    if (monto > actual.saldo_pendiente) throw Object.assign(new Error('El monto supera el saldo pendiente de este concepto.'), { status: 400 });
    const operacion = await OperacionPago.create({ paciente_id: concepto.paciente_id, historia_clinica_id: concepto.historia_clinica_id,
      fecha: req.body.fecha || today(), hora: req.body.hora || nowTime(), monto_total: monto, metodo: req.body.metodo,
      usuario_receptor_id: receiverId, numero_recibo: newReceipt(),
      numero_comprobante: req.body.numero_comprobante || null, archivo_comprobante: req.body.archivo_comprobante || null,
      observacion: req.body.observacion || null, tipo: 'ESPECIFICO', estado: 'ACTIVA' }, { transaction });
    const movimiento = await MovimientoPago.create({
      concepto_cobro_id: concepto.id,
      operacion_pago_id: operacion.id,
      usuario_receptor_id: receiverId,
      fecha: req.body.fecha || today(), hora: req.body.hora || nowTime(), monto, metodo: req.body.metodo,
      numero_comprobante: req.body.numero_comprobante || null, archivo_comprobante: req.body.archivo_comprobante || null,
      observacion: req.body.observacion || null, numero_recibo: null
    }, { transaction });
    const integrity = validatePaymentOperation({ ...operacion.toJSON(), aplicaciones: [movimiento.toJSON()] });
    if (!integrity.valida) throw new Error(`La operación de pago es inconsistente: ${integrity.errores.join(' ')}`);
    await MovimientoPagoAuditoria.create({ movimiento_pago_id: movimiento.id, usuario_id: req.usuario.id, accion: 'Registro inicial', valor_nuevo: movimiento.toJSON() }, { transaction });
    await ActividadSistema.create({ usuario_id: req.usuario.id, entidad_id: operacion.id,
      fecha: today(), hora: nowTime(), modulo: 'Control financiero', accion: 'OPERACION_PAGO_CREADA',
      detalle: `${operacion.numero_recibo}: ${monto}`, datos: { operacion_pago_id: operacion.id, aplicaciones: 1 },
      metodo: 'POST', ruta: req.originalUrl }, { transaction });
    const resumen = await sincronizarSesion(concepto.id, transaction);
    await transaction.commit();
    res.status(201).json({ message: 'El pago fue aplicado correctamente.', operacion, movimiento, resumen });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

exports.editarMovimiento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const movimiento = await MovimientoPago.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!movimiento) throw Object.assign(new Error('Movimiento no encontrado.'), { status: 404 });
    if (movimiento.operacion_pago_id) throw Object.assign(new Error('Este movimiento pertenece a una operación de pago y no puede editarse por separado.'), { status: 409 });
    const arqueo = movimiento.arqueo_id ? await ArqueoPago.findByPk(movimiento.arqueo_id, { transaction }) : null;
    if (arqueo?.estado === 'Cerrado' && req.usuario.rol !== 'admin') throw Object.assign(new Error('Este pago pertenece a un arqueo cerrado.'), { status: 403 });
    if (arqueo?.estado === 'Cerrado' && !req.body.motivo) throw Object.assign(new Error('El motivo de corrección es obligatorio.'), { status: 400 });
    const anterior = movimiento.toJSON();
    const { monto, receiverId } = await validatePaymentInput({ ...req.body, usuario_receptor_id: req.body.usuario_receptor_id || movimiento.usuario_receptor_id }, req.usuario.id, transaction);
    const otherActive = await MovimientoPago.sum('monto', { where: { concepto_cobro_id: movimiento.concepto_cobro_id, estado: 'Activo', id: { [Op.ne]: movimiento.id } }, transaction });
    const concepto = await ConceptoCobro.findByPk(movimiento.concepto_cobro_id, { transaction });
    if (money(Number(otherActive || 0) + monto) > money(concepto.monto_esperado)) throw Object.assign(new Error('El monto supera el saldo pendiente de este concepto.'), { status: 400 });
    await movimiento.update({ fecha: req.body.fecha, hora: req.body.hora, monto, metodo: req.body.metodo, numero_comprobante: req.body.numero_comprobante || null, archivo_comprobante: req.body.archivo_comprobante || null, usuario_receptor_id: receiverId, observacion: req.body.observacion || null }, { transaction });
    await MovimientoPagoAuditoria.create({ movimiento_pago_id: movimiento.id, usuario_id: req.usuario.id, accion: 'Edición', motivo: req.body.motivo || null, valor_anterior: anterior, valor_nuevo: movimiento.toJSON() }, { transaction });
    await sincronizarSesion(movimiento.concepto_cobro_id, transaction);
    await transaction.commit();
    res.json({ message: 'Pago actualizado correctamente.', movimiento });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

exports.anularMovimiento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!req.body.motivo?.trim()) throw Object.assign(new Error('El motivo de anulación es obligatorio.'), { status: 400 });
    const movimiento = await MovimientoPago.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!movimiento) throw Object.assign(new Error('Movimiento no encontrado.'), { status: 404 });
    if (movimiento.operacion_pago_id) throw Object.assign(new Error('Este movimiento pertenece a una operación de pago. Anule la operación completa.'), { status: 409 });
    const arqueo = movimiento.arqueo_id ? await ArqueoPago.findByPk(movimiento.arqueo_id, { transaction }) : null;
    if (arqueo?.estado === 'Cerrado' && req.usuario.rol !== 'admin') throw Object.assign(new Error('Este pago pertenece a un arqueo cerrado.'), { status: 403 });
    const anterior = movimiento.toJSON();
    await movimiento.update({ estado: 'Anulado', motivo_anulacion: req.body.motivo, anulado_por_id: req.usuario.id, anulado_en: new Date() }, { transaction });
    await MovimientoPagoAuditoria.create({ movimiento_pago_id: movimiento.id, usuario_id: req.usuario.id, accion: 'Anulación', motivo: req.body.motivo, valor_anterior: anterior, valor_nuevo: movimiento.toJSON() }, { transaction });
    await sincronizarSesion(movimiento.concepto_cobro_id, transaction);
    await transaction.commit();
    res.json({ message: 'Movimiento anulado correctamente.' });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

exports.historialMovimiento = async (req, res, next) => {
  try {
    const historial = await MovimientoPagoAuditoria.findAll({ where: { movimiento_pago_id: req.params.id }, include: [{ model: Usuario, as: 'usuario', attributes: ['nombre', 'usuario'] }], order: [['created_at', 'ASC']] });
    res.json(historial);
  } catch (error) { next(error); }
};

exports.listarArqueos = async (req, res, next) => {
  try { res.json(await ArqueoPago.findAll({ include: [{ model: Usuario, as: 'responsable', attributes: ['nombre'] }], order: [['created_at', 'DESC']] })); } catch (error) { next(error); }
};

exports.guardarArqueo = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    if (!req.body.fecha_desde || !req.body.fecha_hasta || req.body.fecha_desde > req.body.fecha_hasta) throw Object.assign(new Error('Seleccione un rango de fechas válido.'), { status: 400 });
    if (req.body.cerrar) {
      const existing = await ArqueoPago.findOne({ where: { fecha_desde: req.body.fecha_desde, fecha_hasta: req.body.fecha_hasta, estado: 'Cerrado' }, transaction });
      if (existing) throw Object.assign(new Error('Este período ya tiene un arqueo cerrado.'), { status: 409 });
    }
    const concepts = (await ConceptoCobro.findAll({ include: includeConcepto, transaction })).map(resumenConcepto)
      .map((item) => ({ ...item, movimientos: item.movimientos.filter((movement) => movement.estado === 'Activo' && movement.fecha >= req.body.fecha_desde && movement.fecha <= req.body.fecha_hasta) }))
      .filter((item) => item.estado !== 'Anulado' && item.movimientos.length > 0);
    const indicators = buildIndicators(concepts);
    const diferencia = money(money(req.body.efectivo_contado) - indicators.efectivo);
    const estado = req.body.cerrar ? 'Cerrado' : 'Borrador';
    const arqueo = await ArqueoPago.create({
      fecha_desde: req.body.fecha_desde, fecha_hasta: req.body.fecha_hasta, usuario_id: req.usuario.id,
      total_esperado: indicators.total_esperado, total_cobrado: indicators.total_cobrado, total_pendiente: indicators.total_pendiente,
      efectivo_sistema: indicators.efectivo, efectivo_contado: money(req.body.efectivo_contado), qr_sistema: indicators.qr, qr_confirmado: money(req.body.qr_confirmado),
      transferencia_sistema: indicators.transferencia, transferencia_confirmada: money(req.body.transferencia_confirmada), tarjeta_sistema: indicators.tarjeta, tarjeta_confirmada: money(req.body.tarjeta_confirmada),
      diferencia, cantidad_movimientos: indicators.movimientos, pacientes_deuda: indicators.pacientes_deuda, observacion: req.body.observacion || null,
      estado, cerrado_en: estado === 'Cerrado' ? new Date() : null
    }, { transaction });
    if (estado === 'Cerrado') {
      const ids = concepts.flatMap((item) => item.movimientos.filter((m) => m.estado === 'Activo' && m.fecha >= req.body.fecha_desde && m.fecha <= req.body.fecha_hasta && !m.arqueo_id).map((m) => m.id));
      if (ids.length) await MovimientoPago.update({ arqueo_id: arqueo.id }, { where: { id: { [Op.in]: ids } }, transaction });
    }
    await transaction.commit();
    res.status(201).json({ message: estado === 'Cerrado' ? 'Arqueo cerrado correctamente.' : 'Borrador de arqueo guardado.', arqueo });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

exports.reabrirArqueo = async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ message: 'Solo un administrador puede reabrir un arqueo.' });
    if (!req.body.motivo?.trim()) return res.status(400).json({ message: 'El motivo es obligatorio.' });
    const arqueo = await ArqueoPago.findByPk(req.params.id);
    if (!arqueo) return res.status(404).json({ message: 'Arqueo no encontrado.' });
    await arqueo.update({ estado: 'Reabierto', reabierto_en: new Date(), reabierto_por_id: req.usuario.id, motivo_reapertura: req.body.motivo });
    res.json({ message: 'Arqueo reabierto correctamente.' });
  } catch (error) { next(error); }
};

exports.detalleOperacionPago = async (req, res, next) => {
  try {
    const operation = await OperacionPago.findByPk(req.params.id, { include: [{ model: Paciente, as: 'paciente' }, { model: HistoriaClinica, as: 'historia_clinica' },
      { model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre', 'usuario'] }, { model: Usuario, as: 'anulado_por', attributes: ['id', 'nombre', 'usuario'] },
      { model: MovimientoPago, as: 'aplicaciones', include: [{ model: ConceptoCobro, as: 'concepto', include: [{ model: Sesion, as: 'sesion' }] }, { model: ArqueoPago, as: 'arqueo', attributes: ['id', 'numero_arqueo', 'estado'] }] }] });
    if (!operation) return res.status(404).json({ message: 'Operación de pago no encontrada.' }); res.json(operation);
  } catch (error) { next(error); }
};

exports.anularOperacionPago = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const reason = String(req.body.motivo || '').trim(); if (!reason) throw Object.assign(new Error('El motivo de anulación es obligatorio.'), { status: 400 });
    const operation = await OperacionPago.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!operation) throw Object.assign(new Error('Operación de pago no encontrada.'), { status: 404 });
    if (operation.estado === 'ANULADA') throw Object.assign(new Error('La operación ya fue anulada.'), { status: 409 });
    const children = await MovimientoPago.findAll({ where: { operacion_pago_id: operation.id }, transaction, lock: transaction.LOCK.UPDATE });
    const closed = children.find((item) => item.arqueo_id);
    if (closed) { const arqueo = await ArqueoPago.findByPk(closed.arqueo_id, { transaction }); if (arqueo?.estado === 'Cerrado') throw Object.assign(new Error('La operación pertenece a un arqueo cerrado. Reabra el arqueo antes de anularla.'), { status: 409 }); }
    await operation.update({ estado: 'ANULADA', anulado_por_id: req.usuario.id, anulado_en: new Date(), motivo_anulacion: reason }, { transaction });
    await MovimientoPago.update({ estado: 'Anulado', anulado_por_id: req.usuario.id, anulado_en: new Date(), motivo_anulacion: reason }, { where: { operacion_pago_id: operation.id }, transaction });
    for (const conceptId of new Set(children.map((item) => item.concepto_cobro_id))) await sincronizarSesion(conceptId, transaction);
    await ActividadSistema.create({ usuario_id: req.usuario.id, entidad_id: operation.id, fecha: today(), hora: nowTime(), modulo: 'Control financiero', accion: 'OPERACION_PAGO_ANULADA', detalle: reason, datos: { operacion_pago_id: operation.id }, metodo: 'PATCH', ruta: req.originalUrl }, { transaction });
    await transaction.commit(); res.json({ message: 'Operación de pago anulada correctamente.' });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

const distributePayment = (concepts, amount) => {
  let remaining = money(amount);
  return concepts.map((concept) => { const applied = money(Math.min(remaining, concept.saldo_pendiente)); remaining = money(remaining - applied); return { ...concept, aplicado: applied, saldo_despues: money(concept.saldo_pendiente - applied) }; });
};

const pendingHistoryConcepts = async (historiaId, transaction, lock = false) => {
  const options = { where: { historia_clinica_id: historiaId, activo: true, exonerado: false, estado: { [Op.ne]: 'Anulado' } }, include: includeConcepto, transaction,
    order: [['fecha_origen', 'ASC'], [{ model: Sesion, as: 'sesion' }, 'numero_sesion', 'ASC'], ['id', 'ASC']] };
  if (lock) options.lock = { level: transaction.LOCK.UPDATE, of: ConceptoCobro };
  const rows = await ConceptoCobro.findAll(options);
  return rows.map(resumenConcepto).filter((item) => item.saldo_pendiente > 0);
};

exports.previewPagoDeuda = async (req, res, next) => {
  try {
    const concepts = await pendingHistoryConcepts(req.params.historiaId);
    if (!concepts.length) return res.status(404).json({ message: 'La historia no tiene deuda pendiente.' });
    const amount = money(req.body.monto); const debt = money(concepts.reduce((sum, item) => sum + item.saldo_pendiente, 0));
    if (amount <= 0) return res.status(400).json({ message: 'Ingrese un monto mayor a cero.' });
    if (amount > debt) return res.status(400).json({ message: 'El monto supera la deuda total de esta historia.', exceso: money(amount - debt) });
    const distribution = distributePayment(concepts, amount);
    res.json({ paciente_id: concepts[0].paciente_id, historia_clinica_id: Number(req.params.historiaId), deuda_total: debt, monto_recibido: amount,
      distribucion: distribution.map((item) => ({ concepto_id: item.id, detalle: item.detalle, fecha_origen: item.fecha_origen, sesion: item.sesion?.numero_sesion || null, saldo_antes: item.saldo_pendiente, aplicado: item.aplicado, saldo_despues: item.saldo_despues })), saldo_restante: money(debt - amount) });
  } catch (error) { next(error); }
};

exports.pagarDeudaHistoria = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { monto: amount, receiverId } = await validatePaymentInput(req.body, req.usuario.id, transaction);
    const concepts = await pendingHistoryConcepts(req.params.historiaId, transaction, true);
    if (!concepts.length) throw Object.assign(new Error('La deuda cambió mientras se procesaba el pago. Actualiza e intenta nuevamente.'), { status: 409 });
    const debt = money(concepts.reduce((sum, item) => sum + item.saldo_pendiente, 0));
    if (amount > debt) throw Object.assign(new Error('El monto supera la deuda total de esta historia.'), { status: 400 });
    const distribution = distributePayment(concepts, amount).filter((item) => item.aplicado > 0);
    const operation = await OperacionPago.create({ paciente_id: concepts[0].paciente_id, historia_clinica_id: Number(req.params.historiaId),
      fecha: req.body.fecha || today(), hora: req.body.hora || nowTime(), monto_total: amount, metodo: req.body.metodo,
      usuario_receptor_id: receiverId, numero_recibo: newReceipt(), numero_comprobante: req.body.numero_comprobante || null,
      archivo_comprobante: req.body.archivo_comprobante || null, observacion: req.body.observacion || null, tipo: 'DEUDA_HISTORIA', estado: 'ACTIVA' }, { transaction });
    const movements = [];
    for (const item of distribution) {
      const movement = await MovimientoPago.create({ concepto_cobro_id: item.id, operacion_pago_id: operation.id, usuario_receptor_id: operation.usuario_receptor_id,
        fecha: operation.fecha, hora: operation.hora, monto: item.aplicado, metodo: operation.metodo, numero_recibo: null, estado: 'Activo' }, { transaction });
      movements.push(movement); await sincronizarSesion(item.id, transaction);
    }
    const childTotal = money(movements.reduce((sum, item) => sum + Number(item.monto), 0));
    if (childTotal !== amount) throw new Error('La distribución no coincide con el monto total de la operación.');
    const integrity = validatePaymentOperation({ ...operation.toJSON(), aplicaciones: movements.map((item) => item.toJSON()) });
    if (!integrity.valida) throw new Error(`La operación de pago es inconsistente: ${integrity.errores.join(' ')}`);
    await ActividadSistema.create({ usuario_id: req.usuario.id, entidad_id: operation.id, fecha: today(), hora: nowTime(), modulo: 'Control financiero',
      accion: 'OPERACION_PAGO_CREADA', detalle: `${operation.numero_recibo}: ${amount}`, datos: { operacion_pago_id: operation.id, aplicaciones: movements.length }, metodo: 'POST', ruta: req.originalUrl }, { transaction });
    await transaction.commit();
    res.status(201).json({ message: 'El pago fue aplicado correctamente.', operacion: operation, aplicaciones: movements, distribucion: distribution.map((item) => ({ concepto_id: item.id, aplicado: item.aplicado })) });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

// Implementación profesional diaria. Estas asignaciones sustituyen los handlers
// legacy conservando las rutas públicas existentes.
exports.listarArqueos = async (req, res, next) => {
  try { res.json(await arqueoCajaService.list(req.query)); } catch (error) { next(error); }
};
exports.guardarArqueo = async (req, res, next) => {
  try {
    const arqueo = await arqueoCajaService.save(req.body, req.usuario.id);
    res.status(201).json({ message: req.body.cerrar ? 'Arqueo cerrado correctamente.' : 'Borrador de arqueo guardado.', arqueo });
  } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};
exports.reabrirArqueo = async (req, res, next) => {
  try {
    if (req.usuario.rol !== 'admin') return res.status(403).json({ message: 'Solo un administrador puede reabrir un arqueo.' });
    await arqueoCajaService.reopen(req.params.id, req.body.motivo, req.usuario.id);
    res.json({ message: 'Arqueo reabierto correctamente.' });
  } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};
exports.arqueoActual = async (req, res, next) => { try { res.json(await arqueoCajaService.current(req.query.fecha)); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); } };
exports.previewArqueo = async (req, res, next) => { try { res.json(await arqueoCajaService.preview(req.body)); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); } };
exports.detalleArqueo = async (req, res, next) => { try { res.json(await arqueoCajaService.detail(req.params.id)); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); } };
exports.consolidadoArqueos = async (req, res, next) => { try { res.json(await arqueoCajaService.consolidated(req.query)); } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); } };
exports.distributePayment = distributePayment;
exports.withPeriodData = withPeriodData;
exports.matchesPaymentPlan = matches;
exports.buildPaymentOperations = buildOperations;
