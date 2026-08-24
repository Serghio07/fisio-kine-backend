const { Op, QueryTypes } = require('sequelize');
const {
  ActividadSistema,
  ArqueoPago,
  MovimientoCaja,
  MovimientoPago,
  Usuario,
  sequelize,
  TIPOS_MOVIMIENTO_CAJA,
  METODOS_MOVIMIENTO_CAJA,
  CATEGORIAS_EGRESO
} = require('../models');
const { boliviaDate, boliviaDateTime, boliviaTime } = require('../utils/boliviaDateTime');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
  && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const validatePayload = (payload = {}) => {
  const tipo = String(payload.tipo_movimiento || '').trim();
  const metodo = String(payload.metodo || '').trim();
  const concepto = String(payload.concepto || '').trim();
  const categoria = payload.categoria ? String(payload.categoria).trim() : null;
  const motivo = payload.motivo ? String(payload.motivo).trim() : null;
  const monto = money(payload.monto);
  const fecha = payload.fecha || boliviaDate();
  const hora = payload.hora || boliviaTime();
  if (!TIPOS_MOVIMIENTO_CAJA.includes(tipo)) throw fail('Seleccione un tipo de movimiento válido.');
  if (!METODOS_MOVIMIENTO_CAJA.includes(metodo)) throw fail('Seleccione un método válido.');
  if (!concepto) throw fail('El concepto es obligatorio.');
  if (!Number.isFinite(monto) || monto <= 0) throw fail('El monto debe ser mayor a cero.');
  if (!isIsoDate(fecha)) throw fail('La fecha no es válida.');
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(hora))) throw fail('La hora no es válida.');
  if (tipo === 'EGRESO' && !CATEGORIAS_EGRESO.includes(categoria)) throw fail('Seleccione una categoría válida para el egreso.');
  if (tipo !== 'EGRESO' && categoria) throw fail('La categoría sólo corresponde a movimientos de tipo egreso.');
  if (['APORTE_CAJA', 'RETIRO_CAJA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].includes(tipo) && metodo !== 'Efectivo') throw fail('Los aportes, retiros y ajustes de caja sólo pueden registrarse en efectivo.');
  if (['AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'].includes(tipo) && !motivo) throw fail('El motivo es obligatorio para registrar un ajuste.');
  return { tipo_movimiento: tipo, metodo, concepto, categoria, motivo, monto, fecha, hora };
};

const movementTotals = (rows = []) => rows.reduce((totals, row) => {
  const type = row.tipo_movimiento;
  const amount = money(row.monto);
  if (type === 'INGRESO_EXTRAORDINARIO') totals.ingresos_extraordinarios += amount;
  if (type === 'EGRESO') totals.egresos += amount;
  if (type === 'APORTE_CAJA') totals.aportes += amount;
  if (type === 'RETIRO_CAJA') totals.retiros += amount;
  if (type === 'AJUSTE_POSITIVO') totals.ajustes_positivos += amount;
  if (type === 'AJUSTE_NEGATIVO') totals.ajustes_negativos += amount;
  return totals;
}, { ingresos_extraordinarios: 0, egresos: 0, aportes: 0, retiros: 0, ajustes_positivos: 0, ajustes_negativos: 0 });

const calcularSaldoCaja = async (fecha = boliviaDate(), options = {}) => {
  if (!isIsoDate(fecha)) throw fail('La fecha no es válida.');
  const { transaction } = options;
  const cierreAnterior = await ArqueoPago.findOne({
    where: { estado: 'Cerrado', fecha_operativa: { [Op.lt]: fecha }, saldo_dejado_caja: { [Op.ne]: null } },
    order: [['fecha_operativa', 'DESC'], ['cerrado_en', 'DESC']], transaction
  });
  const lowerDate = cierreAnterior?.fecha_operativa || null;
  const dateWhere = lowerDate ? { [Op.gt]: lowerDate, [Op.lte]: fecha } : fecha;
  const draft = !cierreAnterior ? await ArqueoPago.findOne({ where: { fecha_operativa: fecha, estado: { [Op.in]: ['Borrador', 'Reabierto'] }, saldo_inicial_manual: true }, order: [['id', 'DESC']], transaction }) : null;
  const [pagosEfectivo, movimientos] = await Promise.all([
    MovimientoPago.sum('monto', { where: { estado: 'Activo', metodo: 'Efectivo', fecha: dateWhere }, transaction }),
    MovimientoCaja.findAll({
      attributes: ['tipo_movimiento', 'monto'],
      where: { estado: 'ACTIVO', metodo: 'Efectivo', fecha: dateWhere },
      raw: true, transaction
    })
  ]);
  const totals = movementTotals(movimientos);
  const openingDefined = Boolean(cierreAnterior || draft);
  const saldoInicial = money(cierreAnterior?.saldo_dejado_caja ?? draft?.saldo_inicial_efectivo);
  const saldo = money(saldoInicial + money(pagosEfectivo) + totals.ingresos_extraordinarios + totals.aportes
    + totals.ajustes_positivos - totals.egresos - totals.retiros - totals.ajustes_negativos);
  return {
    fecha, desde: lowerDate || fecha, saldo_inicial: saldoInicial, apertura_pendiente: !openingDefined, saldo_provisional: !openingDefined,
    arqueo_origen: cierreAnterior ? { id: cierreAnterior.id, numero_arqueo: cierreAnterior.numero_arqueo, fecha_operativa: cierreAnterior.fecha_operativa } : null,
    pagos_pacientes_efectivo: money(pagosEfectivo), ...totals, saldo_caja: saldo
  };
};

const listar = async (query = {}) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
  const where = {};
  if (query.desde || query.hasta) where.fecha = { ...(query.desde ? { [Op.gte]: query.desde } : {}), ...(query.hasta ? { [Op.lte]: query.hasta } : {}) };
  if (query.tipo && query.tipo !== 'Todos') where.tipo_movimiento = query.tipo;
  if (query.metodo && query.metodo !== 'Todos') where.metodo = query.metodo;
  if (query.estado && query.estado !== 'Todos') where.estado = query.estado;
  if (query.categoria && query.categoria !== 'Todas') where.categoria = query.categoria;
  if (String(query.texto || '').trim()) {
    const text = `%${String(query.texto).trim()}%`;
    where[Op.or] = [{ concepto: { [Op.iLike]: text } }, { descripcion: { [Op.iLike]: text } }, { motivo: { [Op.iLike]: text } }, { comprobante: { [Op.iLike]: text } }];
  }
  const result = await MovimientoCaja.findAndCountAll({
    where, include: [
      { model: Usuario, as: 'registradoPor', attributes: ['id', 'nombre', 'usuario'] },
      { model: Usuario, as: 'anuladoPor', attributes: ['id', 'nombre', 'usuario'] },
      { model: ArqueoPago, as: 'arqueo', attributes: ['id', 'numero_arqueo', 'fecha_operativa', 'estado'] }
    ], order: [['fecha', 'DESC'], ['hora', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit, distinct: true
  });
  const warningPattern = /\b(pago|pagos|paciente|sesión|sesion)\b/i;
  const items = result.rows.map((row) => { const item = row.toJSON(); return { ...item,
    advertencia_clasificacion: item.tipo_movimiento === 'INGRESO_EXTRAORDINARIO' && warningPattern.test(item.concepto || '')
      ? 'Revisar clasificación: este ingreso extraordinario podría corresponder a un pago de paciente.' : null }; });
  return { items, total: result.count, page, limit, pages: Math.max(Math.ceil(result.count / limit), 1) };
};

const resumen = async (query = {}) => {
  const desde = query.desde || boliviaDate();
  const hasta = query.hasta || desde;
  if (!isIsoDate(desde) || !isIsoDate(hasta) || desde > hasta) throw fail('Seleccione un período válido.');
  const [movimientos, pagosPacientes, saldo] = await Promise.all([
    MovimientoCaja.findAll({ attributes: ['tipo_movimiento', 'monto'], where: { estado: 'ACTIVO', fecha: { [Op.between]: [desde, hasta] } }, raw: true }),
    MovimientoPago.sum('monto', { where: { estado: 'Activo', fecha: { [Op.between]: [desde, hasta] } } }),
    calcularSaldoCaja(hasta)
  ]);
  const totals = movementTotals(movimientos);
  return {
    periodo: { desde, hasta }, pagos_pacientes: money(pagosPacientes), ...totals,
    ingresos_operativos: money(Number(pagosPacientes || 0) + totals.ingresos_extraordinarios),
    resultado_neto: money(Number(pagosPacientes || 0) + totals.ingresos_extraordinarios - totals.egresos),
    saldo_caja: saldo.saldo_caja, detalle_saldo: saldo, cantidad_movimientos: movimientos.length
  };
};

const audit = (usuarioId, movimiento, accion, transaction) => {
  const now = boliviaDateTime();
  return ActividadSistema.create({ usuario_id: usuarioId, entidad_id: movimiento.id, fecha: now.fecha, hora: now.hora,
    modulo: 'Control financiero', accion, detalle: `${movimiento.tipo_movimiento}: ${movimiento.concepto}`.slice(0, 500),
    datos: { movimiento_caja_id: movimiento.id, monto: movimiento.monto, metodo: movimiento.metodo }, metodo: 'POST', ruta: '/api/finanzas/movimientos-caja'
  }, { transaction });
};

const crear = async (payload, usuarioId) => {
  const valid = validatePayload(payload);
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', { replacements: { key: `movimientos_caja:${valid.fecha}` }, type: QueryTypes.SELECT, transaction });
    const cierre = await ArqueoPago.findOne({ where: { fecha_operativa: valid.fecha, estado: 'Cerrado' }, transaction });
    if (cierre) throw fail('La fecha seleccionada ya tiene un arqueo cerrado y no admite nuevos movimientos de caja.', 409);
    if (valid.tipo_movimiento === 'RETIRO_CAJA') {
      const saldo = await calcularSaldoCaja(valid.fecha, { transaction });
      if (valid.monto > saldo.saldo_caja) throw fail('No existe suficiente efectivo disponible para realizar el retiro.');
    }
    const movimiento = await MovimientoCaja.create({ ...valid, descripcion: payload.descripcion?.trim() || null,
      comprobante: payload.comprobante?.trim() || null, usuario_id: usuarioId, origen: 'MANUAL', estado: 'ACTIVO'
    }, { transaction });
    await audit(usuarioId, movimiento, 'MOVIMIENTO_CAJA_CREADO', transaction);
    return movimiento;
  });
};

const obtener = async (id) => {
  const item = await MovimientoCaja.findByPk(id, { include: [
    { model: Usuario, as: 'registradoPor', attributes: ['id', 'nombre', 'usuario'] },
    { model: Usuario, as: 'anuladoPor', attributes: ['id', 'nombre', 'usuario'] },
    { model: ArqueoPago, as: 'arqueo', attributes: ['id', 'numero_arqueo', 'fecha_operativa', 'estado'] }
  ] });
  if (!item) throw fail('Movimiento de caja no encontrado.', 404);
  return item;
};

const anular = async (id, motivo, usuarioId) => sequelize.transaction(async (transaction) => {
  const text = String(motivo || '').trim();
  if (!text) throw fail('El motivo de anulación es obligatorio.');
  const movimiento = await MovimientoCaja.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!movimiento) throw fail('Movimiento de caja no encontrado.', 404);
  if (movimiento.estado === 'ANULADO') throw fail('El movimiento ya fue anulado.', 409);
  if (movimiento.arqueo_id) {
    const arqueo = await ArqueoPago.findByPk(movimiento.arqueo_id, { transaction });
    if (arqueo?.estado === 'Cerrado') throw fail('Este movimiento pertenece a un arqueo cerrado y no puede anularse.', 409);
  }
  await movimiento.update({ estado: 'ANULADO', anulado_por_id: usuarioId, anulado_en: new Date(), motivo_anulacion: text }, { transaction });
  await audit(usuarioId, movimiento, 'MOVIMIENTO_CAJA_ANULADO', transaction);
  return movimiento;
});

module.exports = { validatePayload, movementTotals, calcularSaldoCaja, listar, resumen, crear, obtener, anular };
