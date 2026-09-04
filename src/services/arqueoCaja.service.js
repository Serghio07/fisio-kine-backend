const { Op, QueryTypes } = require('sequelize');
const {
  ActividadSistema, ArqueoPago, ArqueoMovimientoSnapshot, ArqueoMovimientoCajaSnapshot,
  ConceptoCobro, HistoriaClinica, MovimientoCaja, MovimientoPago, Paciente, Usuario, sequelize
} = require('../models');
const { boliviaDate, boliviaDateTime } = require('../utils/boliviaDateTime');
const financialConsolidation = require('./financialConsolidation.service');

const METHODS = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const pendingObligations = (rows = []) => rows.filter((row) => money(row.saldoPendiente ?? row.saldo_pendiente) > 0);
const historicalObligations = (snapshot, reconstructed = []) => {
  if (Array.isArray(snapshot?.obligaciones_no_canceladas)) {
    return { obligacionesNoCanceladas: snapshot.obligaciones_no_canceladas, fuenteObligacionesNoCanceladas: 'SNAPSHOT' };
  }
  return { obligacionesNoCanceladas: pendingObligations(reconstructed), fuenteObligacionesNoCanceladas: 'RECONSTRUIDO' };
};

const debtSummaryFromRows = (rows = []) => {
  const debtors = new Map(); let totalExpected = 0; let totalPending = 0;
  for (const row of rows) {
    const expected = money(row.monto_esperado); const paid = money(row.total_pagado);
    const pending = money(Math.max(expected - paid, 0));
    totalExpected += expected; totalPending += pending;
    if (pending <= 0) continue;
    const key = `${row.paciente_id || 'sin-paciente'}:${row.historia_clinica_id || 'sin-historia'}`;
    const current = debtors.get(key) || { paciente_id: row.paciente_id || null, historia_clinica_id: row.historia_clinica_id || null, deuda: 0 };
    current.deuda = money(current.deuda + pending); debtors.set(key, current);
  }
  return { total_esperado: money(totalExpected), total_pendiente: money(totalPending), pacientes_deuda: debtors.size, deudores: [...debtors.values()] };
};

const debtSummary = async (transaction) => {
  const [rows] = await sequelize.query(`SELECT c.paciente_id, c.historia_clinica_id, c.monto_esperado,
    COALESCE(SUM(p.monto) FILTER (WHERE p.estado = 'Activo'), 0) AS total_pagado
    FROM conceptos_cobro c LEFT JOIN movimientos_pago p ON p.concepto_cobro_id = c.id
    WHERE c.activo = TRUE AND c.exonerado = FALSE AND c.estado <> 'Anulado'
    GROUP BY c.id, c.paciente_id, c.historia_clinica_id, c.monto_esperado`, { transaction });
  return debtSummaryFromRows(rows);
};

const previousClosing = (fecha, transaction) => ArqueoPago.findOne({
  where: { estado: 'Cerrado', fecha_operativa: { [Op.lt]: fecha, [Op.ne]: null }, saldo_dejado_caja: { [Op.ne]: null } },
  order: [['fecha_operativa', 'DESC'], ['cerrado_en', 'DESC']], transaction
});

const openingFromPrevious = (previous) => ({
  saldo_inicial_efectivo: money(previous?.saldo_dejado_caja),
  saldo_inicial_origen: previous ? { id: previous.id, numero_arqueo: previous.numero_arqueo, fecha_operativa: previous.fecha_operativa } : null,
  requiere_saldo_inicial_manual: !previous,
  apertura_pendiente: !previous
});

const calculate = async (fecha = boliviaDate(), transaction, lock = false) => {
  if (!validDate(fecha)) throw fail('La fecha operativa no es válida.');
  const paymentOptions = { where: { fecha, estado: 'Activo', arqueo_id: null }, transaction, raw: true };
  const cashOptions = { where: { fecha, estado: 'ACTIVO', arqueo_id: null }, transaction, raw: true };
  if (lock && transaction) { paymentOptions.lock = transaction.LOCK.UPDATE; cashOptions.lock = transaction.LOCK.UPDATE; }
  const previous = await previousClosing(fecha, transaction);
  const opening = openingFromPrevious(previous);
  const payments = await MovimientoPago.findAll(paymentOptions);
  const cash = await MovimientoCaja.findAll(cashOptions);
  const debt = await debtSummary(transaction);
  const paymentByMethod = Object.fromEntries(METHODS.map((method) => [method, money(payments.filter((row) => row.metodo === method).reduce((sum, row) => sum + Number(row.monto), 0))]));
  const cashBreakdown = { ingresos_extraordinarios: 0, egresos: 0, aportes: 0, retiros: 0, ajustes_positivos: 0, ajustes_negativos: 0 };
  const cashSystem = Object.fromEntries(METHODS.map((method) => [method, 0]));
  for (const row of cash) {
    const amount = money(row.monto); const method = METHODS.includes(row.metodo) ? row.metodo : 'Otro';
    if (row.tipo_movimiento === 'INGRESO_EXTRAORDINARIO') { cashBreakdown.ingresos_extraordinarios += amount; cashSystem[method] += amount; }
    if (row.tipo_movimiento === 'EGRESO') { cashBreakdown.egresos += amount; cashSystem[method] -= amount; }
    if (row.tipo_movimiento === 'APORTE_CAJA') cashBreakdown.aportes += amount;
    if (row.tipo_movimiento === 'RETIRO_CAJA') cashBreakdown.retiros += amount;
    if (row.tipo_movimiento === 'AJUSTE_POSITIVO') cashBreakdown.ajustes_positivos += amount;
    if (row.tipo_movimiento === 'AJUSTE_NEGATIVO') cashBreakdown.ajustes_negativos += amount;
  }
  const saldoInicial = opening.saldo_inicial_efectivo;
  const ingresosExtraordinariosEfectivo = money(cash.filter((r) => r.metodo === 'Efectivo' && r.tipo_movimiento === 'INGRESO_EXTRAORDINARIO').reduce((s, r) => s + Number(r.monto), 0));
  const egresosEfectivo = money(cash.filter((r) => r.metodo === 'Efectivo' && r.tipo_movimiento === 'EGRESO').reduce((s, r) => s + Number(r.monto), 0));
  const efectivoEsperado = money(saldoInicial + paymentByMethod.Efectivo
    + ingresosExtraordinariosEfectivo
    + cashBreakdown.aportes + cashBreakdown.ajustes_positivos
    - egresosEfectivo
    - cashBreakdown.retiros - cashBreakdown.ajustes_negativos);
  const systems = { Efectivo: efectivoEsperado };
  for (const method of METHODS.slice(1)) systems[method] = money(paymentByMethod[method] + cashSystem[method]);
  return {
    fecha_operativa: fecha, ...opening, total_esperado: debt.total_esperado,
    total_cobrado: money(payments.reduce((s, r) => s + Number(r.monto), 0)), total_pendiente: debt.total_pendiente,
    pacientes_deuda: debt.pacientes_deuda,
    pagos_pacientes_efectivo: paymentByMethod.Efectivo, ...cashBreakdown,
    ingresos_extraordinarios_efectivo: ingresosExtraordinariosEfectivo,
    egresos_efectivo: egresosEfectivo,
    efectivo_esperado_cierre: efectivoEsperado, sistemas: systems,
    total_sistema: money(METHODS.reduce((s, method) => s + systems[method], 0)),
    cantidad_pagos: payments.length, cantidad_movimientos_caja: cash.length
  };
};

const applyOpening = (calc, rawOpening) => {
  const result = { ...calc, sistemas: { ...calc.sistemas } };
  if (!result.requiere_saldo_inicial_manual || rawOpening === '' || rawOpening === null || rawOpening === undefined) return result;
  const opening = money(rawOpening);
  if (!Number.isFinite(opening) || opening < 0) throw fail('El saldo inicial no puede ser negativo.');
  result.saldo_inicial_efectivo = opening; result.apertura_pendiente = false;
  result.efectivo_esperado_cierre = money(calc.efectivo_esperado_cierre - calc.saldo_inicial_efectivo + opening);
  result.sistemas.Efectivo = result.efectivo_esperado_cierre;
  result.total_sistema = money(METHODS.reduce((sum, method) => sum + result.sistemas[method], 0));
  return result;
};

const closedCurrent = (record) => {
  const item = record?.toJSON ? record.toJSON() : record;
  const snapshot = item?.snapshot_resumen || {};
  const cashRows = item.movimientosCajaSnapshot || [];
  const snapshotCashTotal = (type) => money(cashRows
    .filter((row) => row.estado_snapshot === 'ACTIVO' && row.metodo_snapshot === 'Efectivo' && row.tipo_movimiento_snapshot === type)
    .reduce((sum, row) => sum + Number(row.monto_snapshot || 0), 0));
  const systems = snapshot.sistemas || { Efectivo: money(item.efectivo_sistema), QR: money(item.qr_sistema), Transferencia: money(item.transferencia_sistema), Tarjeta: money(item.tarjeta_sistema), Otro: money(item.otro_sistema) };
  return {
    ...snapshot,
    fecha_operativa: item.fecha_operativa,
    saldo_inicial_efectivo: money(snapshot.saldo_inicial_efectivo ?? item.saldo_inicial_efectivo),
    saldo_inicial_origen: snapshot.saldo_inicial_origen || null,
    requiere_saldo_inicial_manual: Boolean(snapshot.requiere_saldo_inicial_manual ?? item.saldo_inicial_manual),
    apertura_pendiente: false,
    total_esperado: money(snapshot.total_esperado ?? item.total_esperado),
    total_cobrado: money(snapshot.total_cobrado ?? item.total_cobrado),
    total_pendiente: money(snapshot.total_pendiente ?? item.total_pendiente),
    pacientes_deuda: Number(snapshot.pacientes_deuda ?? item.pacientes_deuda ?? 0),
    efectivo_esperado_cierre: money(snapshot.efectivo_esperado_cierre ?? item.efectivo_esperado_cierre ?? item.efectivo_sistema),
    ingresos_extraordinarios_efectivo: money(snapshot.ingresos_extraordinarios_efectivo ?? snapshotCashTotal('INGRESO_EXTRAORDINARIO')),
    egresos_efectivo: money(snapshot.egresos_efectivo ?? snapshotCashTotal('EGRESO')),
    sistemas: systems,
    total_sistema: money(snapshot.total_sistema ?? METHODS.reduce((sum, method) => sum + Number(systems[method] || 0), 0)),
    cerrado: true,
    arqueo: historicalView(record)
  };
};

const current = async (fecha = boliviaDate()) => {
  if (!validDate(fecha)) throw fail('La fecha operativa no es válida.');
  const arqueo = await ArqueoPago.findOne({ where: { fecha_operativa: fecha }, include: [{ model: Usuario, as: 'responsable', attributes: ['id', 'nombre'] }, { model: ArqueoMovimientoCajaSnapshot, as: 'movimientosCajaSnapshot', required: false }], order: [['id', 'DESC']] });
  if (arqueo?.estado === 'Cerrado') {
    const deudaActual = await debtSummary();
    return { ...closedCurrent(arqueo), deuda_vigente_actual: deudaActual.total_pendiente, pacientes_deuda_actual: deudaActual.pacientes_deuda };
  }
  return { ...await calculate(fecha), arqueo };
};

const normalizeConfirmations = (payload, systems, closing) => {
  const map = { Efectivo: 'efectivo_contado', QR: 'qr_confirmado', Transferencia: 'transferencia_confirmada', Tarjeta: 'tarjeta_confirmada', Otro: 'otro_confirmado' };
  const values = {}; const pending = [];
  for (const method of METHODS) {
    const key = map[method]; const raw = payload[key];
    if (raw === '' || raw === null || raw === undefined) {
      if (closing && (method === 'Efectivo' || systems[method] !== 0)) pending.push(method);
      values[key] = systems[method] === 0 ? 0 : null;
    } else { values[key] = money(raw); if (!Number.isFinite(values[key]) || values[key] < 0) throw fail(`La confirmación de ${method} no es válida.`); }
  }
  if (pending.length) throw fail(`Pendiente de confirmar: ${pending.join(', ')}.`);
  return values;
};

const preview = async (payload = {}) => {
  const calc = applyOpening(await calculate(payload.fecha_operativa || boliviaDate()), payload.saldo_inicial_manual);
  const confirmed = normalizeConfirmations(payload, calc.sistemas, false);
  const keyByMethod = { Efectivo: 'efectivo_contado', QR: 'qr_confirmado', Transferencia: 'transferencia_confirmada', Tarjeta: 'tarjeta_confirmada', Otro: 'otro_confirmado' };
  const differenceKey = { Efectivo: 'diferencia_efectivo', QR: 'diferencia_qr', Transferencia: 'diferencia_transferencia', Tarjeta: 'diferencia_tarjeta', Otro: 'diferencia_otro' };
  const diferencias = Object.fromEntries(METHODS.map((method) => {
    const value = confirmed[keyByMethod[method]];
    return [differenceKey[method], value === null ? null : money(value - calc.sistemas[method])];
  }));
  const totalConfirmado = Object.values(confirmed).some((value) => value === null) ? null : money(Object.values(confirmed).reduce((sum, value) => sum + value, 0));
  return { ...calc, confirmados: confirmed, diferencias, total_confirmado: totalConfirmado,
    diferencia_total: totalConfirmado === null ? null : money(totalConfirmado - calc.total_sistema) };
};

const audit = async (usuarioId, arqueo, action, transaction) => {
  const now = boliviaDateTime();
  await ActividadSistema.create({ usuario_id: usuarioId, entidad_id: arqueo.id, fecha: now.fecha, hora: now.hora,
    modulo: 'Control financiero', accion: action, detalle: `${action}: ${arqueo.numero_arqueo}`,
    datos: { arqueo_id: arqueo.id, fecha_operativa: arqueo.fecha_operativa }, metodo: 'POST', ruta: '/api/planilla-pagos/arqueos'
  }, { transaction });
};

const save = (payload, usuarioId) => sequelize.transaction(async (transaction) => {
  const fecha = payload.fecha_operativa || payload.fecha_desde || boliviaDate();
  if (!validDate(fecha)) throw fail('Seleccione una fecha operativa válida.');
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `arqueo-diario:${fecha}` }, type: QueryTypes.SELECT, transaction });
  await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `movimientos_caja:${fecha}` }, type: QueryTypes.SELECT, transaction });
  const closing = Boolean(payload.cerrar);
  const alreadyClosed = await ArqueoPago.findOne({ where: { fecha_operativa: fecha, estado: 'Cerrado' }, transaction, lock: transaction.LOCK.UPDATE });
  if (alreadyClosed) throw fail('La fecha operativa ya tiene un arqueo cerrado.', 409);
  let calc = await calculate(fecha, transaction, closing);
  let opening = calc.saldo_inicial_efectivo; let manual = false;
  if (calc.requiere_saldo_inicial_manual) {
    if (payload.saldo_inicial_manual === '' || payload.saldo_inicial_manual === null || payload.saldo_inicial_manual === undefined) throw fail('Ingresa el efectivo con el que inicia la caja hoy.');
    opening = money(payload.saldo_inicial_manual); manual = true;
    if (opening < 0) throw fail('El saldo inicial no puede ser negativo.');
  }
  calc = applyOpening(calc, opening);
  if (closing && calc.efectivo_esperado_cierre < 0) throw fail('No se puede cerrar: el efectivo esperado en caja es negativo. Registre un aporte o corrija los movimientos antes de continuar.');
  const confirmed = normalizeConfirmations(payload, calc.sistemas, closing);
  const differences = {
    diferencia_efectivo: confirmed.efectivo_contado === null ? null : money(confirmed.efectivo_contado - calc.sistemas.Efectivo),
    diferencia_qr: confirmed.qr_confirmado === null ? null : money(confirmed.qr_confirmado - calc.sistemas.QR),
    diferencia_transferencia: confirmed.transferencia_confirmada === null ? null : money(confirmed.transferencia_confirmada - calc.sistemas.Transferencia),
    diferencia_tarjeta: confirmed.tarjeta_confirmada === null ? null : money(confirmed.tarjeta_confirmada - calc.sistemas.Tarjeta),
    diferencia_otro: confirmed.otro_confirmado === null ? null : money(confirmed.otro_confirmado - calc.sistemas.Otro)
  };
  const hasDifference = Object.values(differences).some((value) => value !== null && value !== 0);
  if (closing && hasDifference && !String(payload.observacion || '').trim()) throw fail('La observación es obligatoria cuando existen diferencias.');
  const withdrawal = money(payload.monto_retirado);
  if (withdrawal < 0 || (confirmed.efectivo_contado !== null && withdrawal > confirmed.efectivo_contado)) throw fail('El monto retirado no puede superar el efectivo contado.');
  let arqueo = await ArqueoPago.findOne({ where: { fecha_operativa: fecha, estado: { [Op.in]: ['Borrador', 'Reabierto'] } }, order: [['id', 'DESC']], transaction, lock: transaction.LOCK.UPDATE });
  if (!arqueo) arqueo = await ArqueoPago.create({ fecha_desde: fecha, fecha_hasta: fecha, fecha_operativa: fecha, usuario_id: usuarioId, numero_arqueo: `BOR-${fecha.replaceAll('-', '')}-${Date.now()}` }, { transaction });
  const totalConfirmed = Object.values(confirmed).some((v) => v === null) ? null : money(Object.values(confirmed).reduce((s, v) => s + v, 0));
  const values = { usuario_id: usuarioId, total_esperado: calc.total_esperado, total_cobrado: calc.total_cobrado, total_pendiente: calc.total_pendiente,
    pacientes_deuda: calc.pacientes_deuda, cantidad_movimientos: calc.cantidad_pagos + calc.cantidad_movimientos_caja,
    saldo_inicial_efectivo: opening, saldo_inicial_origen_arqueo_id: calc.saldo_inicial_origen?.id || null, saldo_inicial_manual: manual,
    saldo_inicial_definido_por_id: manual ? usuarioId : null, saldo_inicial_definido_en: manual ? new Date() : null,
    efectivo_sistema: calc.sistemas.Efectivo, efectivo_esperado_cierre: calc.sistemas.Efectivo, qr_sistema: calc.sistemas.QR,
    transferencia_sistema: calc.sistemas.Transferencia, tarjeta_sistema: calc.sistemas.Tarjeta, otro_sistema: calc.sistemas.Otro,
    efectivo_contado: confirmed.efectivo_contado ?? 0, qr_confirmado: confirmed.qr_confirmado ?? 0,
    transferencia_confirmada: confirmed.transferencia_confirmada ?? 0, tarjeta_confirmada: confirmed.tarjeta_confirmada ?? 0,
    otro_confirmado: confirmed.otro_confirmado, ...differences, diferencia: differences.diferencia_efectivo || 0, monto_retirado: withdrawal,
    saldo_dejado_caja: confirmed.efectivo_contado === null ? null : money(confirmed.efectivo_contado - withdrawal),
    resultado_cierre: closing ? (hasDifference ? 'CON_DIFERENCIA' : 'CUADRADO') : null,
    observacion: String(payload.observacion || '').trim() || null, estado: closing ? 'Cerrado' : 'Borrador', cerrado_en: closing ? new Date() : null };
  if (!closing) { await arqueo.update(values, { transaction }); await audit(usuarioId, arqueo, 'ARQUEO_BORRADOR_GUARDADO', transaction); return arqueo; }
  const [[numberRow]] = await sequelize.query(`SELECT COUNT(*)::integer + 1 AS sequence FROM arqueos_pago WHERE fecha_operativa=:fecha AND estado='Cerrado'`, { replacements: { fecha }, transaction });
  values.numero_arqueo = `ARQ-${fecha.replaceAll('-', '')}-${String(numberRow.sequence).padStart(3, '0')}`;
  await arqueo.update(values, { transaction });
  const payments = await MovimientoPago.findAll({ where: { fecha, estado: 'Activo', arqueo_id: null }, include: [{ model: ConceptoCobro, as: 'concepto', include: [{ model: Paciente, as: 'paciente' }, { model: HistoriaClinica, as: 'historia_clinica' }] }, { model: Usuario, as: 'recibido_por' }], transaction });
  const cash = await MovimientoCaja.findAll({ where: { fecha, estado: 'ACTIVO', arqueo_id: null }, include: [{ model: Usuario, as: 'registradoPor' }], transaction });
  if (payments.length) await MovimientoPago.update({ arqueo_id: arqueo.id }, { where: { id: { [Op.in]: payments.map((r) => r.id) }, arqueo_id: null }, transaction });
  if (cash.length) await MovimientoCaja.update({ arqueo_id: arqueo.id }, { where: { id: { [Op.in]: cash.map((r) => r.id) }, arqueo_id: null }, transaction });
  await ArqueoMovimientoSnapshot.bulkCreate(payments.map((row) => ({ arqueo_id: arqueo.id, movimiento_pago_id: row.id, fecha: row.fecha, hora: row.hora,
    paciente_id: row.concepto?.paciente_id, paciente_nombre_snapshot: `${row.concepto?.paciente?.nombres || ''} ${row.concepto?.paciente?.apellidos || ''}`.trim() || 'Paciente no disponible',
    documento_snapshot: row.concepto?.paciente?.numero_documento || row.concepto?.paciente?.ci || null, historia_clinica_id: row.concepto?.historia_clinica_id,
    historia_snapshot: row.concepto?.historia_clinica ? `Historia ${row.concepto.historia_clinica.id}` : null, concepto_snapshot: row.concepto?.detalle || 'Concepto no disponible',
    metodo_snapshot: row.metodo, monto_snapshot: row.monto, estado_snapshot: row.estado, recibido_por_id: row.usuario_receptor_id, recibido_por_snapshot: row.recibido_por?.nombre || null
  })), { transaction });
  const cashSnapshots = cash.map((row) => ({ arqueo_id: arqueo.id, movimiento_caja_id: row.id, fecha: row.fecha, hora: row.hora, tipo_movimiento_snapshot: row.tipo_movimiento,
    categoria_snapshot: row.categoria, concepto_snapshot: row.concepto, descripcion_snapshot: row.descripcion, motivo_snapshot: row.motivo, monto_snapshot: row.monto,
    metodo_snapshot: row.metodo, estado_snapshot: row.estado, origen_snapshot: row.origen, usuario_id: row.usuario_id, usuario_snapshot: row.registradoPor?.nombre || null, comprobante_snapshot: row.comprobante }));
  if (withdrawal > 0) {
    const retiro = await MovimientoCaja.create({ fecha, hora: boliviaDateTime().hora, tipo_movimiento: 'RETIRO_CAJA', categoria: null, concepto: 'Retiro final de cierre',
      descripcion: `Retiro del arqueo ${values.numero_arqueo}`, monto: withdrawal, metodo: 'Efectivo', usuario_id: usuarioId, arqueo_id: arqueo.id, origen: 'CIERRE_ARQUEO', estado: 'ACTIVO' }, { transaction });
    cashSnapshots.push({ arqueo_id: arqueo.id, movimiento_caja_id: retiro.id, fecha: retiro.fecha, hora: retiro.hora, tipo_movimiento_snapshot: retiro.tipo_movimiento,
      categoria_snapshot: null, concepto_snapshot: retiro.concepto, descripcion_snapshot: retiro.descripcion, motivo_snapshot: null, monto_snapshot: retiro.monto,
      metodo_snapshot: retiro.metodo, estado_snapshot: retiro.estado, origen_snapshot: retiro.origen, usuario_id: usuarioId,
      usuario_snapshot: (await Usuario.findByPk(usuarioId, { transaction }))?.nombre || null, comprobante_snapshot: null });
    await audit(usuarioId, arqueo, 'RETIRO_CIERRE_REGISTRADO', transaction);
  }
  if (cashSnapshots.length) await ArqueoMovimientoCajaSnapshot.bulkCreate(cashSnapshots, { transaction });
  const responsible = await Usuario.findByPk(usuarioId, { attributes: ['id', 'nombre'], transaction });
  const obligations = await financialConsolidation.periodObligations(fecha, fecha, transaction);
  const unpaidSnapshot = pendingObligations(obligations.detalle);
  const snapshot = { ...calc, confirmados: Object.fromEntries(METHODS.map((m) => [m, confirmed[{ Efectivo: 'efectivo_contado', QR: 'qr_confirmado', Transferencia: 'transferencia_confirmada', Tarjeta: 'tarjeta_confirmada', Otro: 'otro_confirmado' }[m]]])),
    diferencias: differences, total_confirmado: totalConfirmed, diferencia_total: totalConfirmed === null ? null : money(totalConfirmed - calc.total_sistema),
    resultado: values.resultado_cierre, estado_cierre_snapshot: 'Cerrado', observacion_snapshot: values.observacion,
    cerrado_en_snapshot: values.cerrado_en, monto_retirado: withdrawal, saldo_dejado_caja: values.saldo_dejado_caja,
    responsable_id: usuarioId, responsable_nombre_snapshot: responsible?.nombre || 'Responsable no disponible', obligaciones_no_canceladas: unpaidSnapshot };
  await arqueo.update({ snapshot_resumen: snapshot }, { transaction });
  await audit(usuarioId, arqueo, 'ARQUEO_CERRADO', transaction);
  return arqueo;
});

const historicalView = (record) => {
  const item = record?.toJSON ? record.toJSON() : record; const snapshot = item?.snapshot_resumen;
  if (!snapshot) return item;
  return { ...item,
    responsable: { id: snapshot.responsable_id ?? item.responsable?.id ?? null, nombre: snapshot.responsable_nombre_snapshot ?? item.responsable?.nombre ?? 'Responsable no disponible' },
    resultado_cierre: snapshot.resultado ?? item.resultado_cierre,
    observacion: snapshot.observacion_snapshot ?? item.observacion,
    monto_retirado: snapshot.monto_retirado ?? item.monto_retirado,
    saldo_dejado_caja: snapshot.saldo_dejado_caja ?? item.saldo_dejado_caja,
    cerrado_en: snapshot.cerrado_en_snapshot ?? item.cerrado_en,
    estado_cierre_original: snapshot.estado_cierre_snapshot ?? 'Cerrado'
  };
};
const list = async (query = {}) => {
  const where = {}; if (query.desde || query.hasta) where.fecha_operativa = { ...(query.desde ? { [Op.gte]: query.desde } : {}), ...(query.hasta ? { [Op.lte]: query.hasta } : {}) };
  const rows = await ArqueoPago.findAll({ where, include: [{ model: Usuario, as: 'responsable', attributes: ['id', 'nombre'] }], order: [[sequelize.literal('fecha_operativa'), 'DESC'], ['id', 'DESC']] });
  return rows.map(historicalView);
};
const detail = async (id) => {
  const item = await ArqueoPago.findByPk(id, { include: [{ model: Usuario, as: 'responsable', attributes: ['id', 'nombre'] }, { model: ArqueoPago, as: 'arqueoOrigenSaldo', attributes: ['id', 'numero_arqueo', 'fecha_operativa'] }, { model: ArqueoMovimientoSnapshot, as: 'movimientosSnapshot' }, { model: ArqueoMovimientoCajaSnapshot, as: 'movimientosCajaSnapshot' }] });
  if (!item) throw fail('Arqueo no encontrado.', 404);
  const historical = historicalView(item);
  const frozen = historical.snapshot_resumen?.obligaciones_no_canceladas;
  if (Array.isArray(frozen)) return { ...historical, ...historicalObligations(historical.snapshot_resumen) };
  const obligations = await financialConsolidation.periodObligations(historical.fecha_operativa, historical.fecha_operativa);
  return { ...historical, ...historicalObligations(historical.snapshot_resumen, obligations.detalle) };
};
const reopen = (id, reason, usuarioId) => sequelize.transaction(async (transaction) => {
  if (!String(reason || '').trim()) throw fail('El motivo es obligatorio.');
  const arqueo = await ArqueoPago.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE }); if (!arqueo) throw fail('Arqueo no encontrado.', 404);
  const later = await ArqueoPago.findOne({ where: { estado: 'Cerrado', fecha_operativa: { [Op.gt]: arqueo.fecha_operativa } }, transaction });
  if (later) throw fail('No se puede reabrir este arqueo porque existen cierres posteriores que dependen de su saldo.', 409);
  await arqueo.update({ estado: 'Reabierto', reabierto_en: new Date(), reabierto_por_id: usuarioId, motivo_reapertura: String(reason).trim() }, { transaction });
  await audit(usuarioId, arqueo, 'ARQUEO_REABIERTO', transaction); return arqueo;
});
const consolidated = async ({ desde, hasta }) => {
  if (!validDate(desde) || !validDate(hasta) || desde > hasta) throw fail('Seleccione un período válido.');
  const rows = await ArqueoPago.findAll({ where: { estado: 'Cerrado', fecha_operativa: { [Op.between]: [desde, hasta] } }, raw: true });
  const result = { desde, hasta, cantidad_cierres: rows.length, arqueos_cuadrados: 0, arqueos_con_diferencia: 0, total_cobrado_pacientes: 0, ingresos_extraordinarios: 0, egresos: 0, aportes: 0, retiros: 0, ajustes: 0, efectivo: 0, qr: 0, transferencia: 0, tarjeta: 0, otro: 0, diferencias: 0 };
  for (const row of rows) { const s = row.snapshot_resumen || {}; result.total_cobrado_pacientes += Number(s.total_cobrado ?? row.total_cobrado); result.ingresos_extraordinarios += Number(s.ingresos_extraordinarios ?? 0); result.egresos += Number(s.egresos ?? 0); result.aportes += Number(s.aportes ?? 0); result.retiros += Number(s.retiros ?? 0) + Number(s.monto_retirado ?? 0); result.ajustes += Number(s.ajustes_positivos ?? 0) - Number(s.ajustes_negativos ?? 0); result.efectivo += Number(s.sistemas?.Efectivo ?? row.efectivo_sistema); result.qr += Number(s.sistemas?.QR ?? row.qr_sistema); result.transferencia += Number(s.sistemas?.Transferencia ?? row.transferencia_sistema); result.tarjeta += Number(s.sistemas?.Tarjeta ?? row.tarjeta_sistema); result.otro += Number(s.sistemas?.Otro ?? row.otro_sistema); result.diferencias += Number(s.diferencia_total ?? 0); if ((s.resultado ?? row.resultado_cierre) === 'CUADRADO') result.arqueos_cuadrados += 1; else result.arqueos_con_diferencia += 1; }
  result.ingresos_operativos = money(result.total_cobrado_pacientes + result.ingresos_extraordinarios); result.resultado_neto = money(result.ingresos_operativos - result.egresos);
  for (const key of Object.keys(result)) if (typeof result[key] === 'number' && !key.includes('cantidad') && !key.startsWith('arqueos_')) result[key] = money(result[key]); return result;
};

module.exports = { METHODS, debtSummaryFromRows, pendingObligations, historicalObligations, normalizeConfirmations, previousClosing, openingFromPrevious, closedCurrent, calculate, applyOpening, preview, current, save, list, detail, reopen, consolidated: financialConsolidation.consolidated };
