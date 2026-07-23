const { Op } = require('sequelize');
const {
  ArqueoPago,
  ConceptoCobro,
  HistoriaClinica,
  MovimientoPago,
  MovimientoPagoAuditoria,
  Paciente,
  Sesion,
  Usuario,
  sequelize
} = require('../models');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validMethods = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const today = () => new Date().toISOString().slice(0, 10);
const nowTime = () => new Date().toTimeString().slice(0, 8);

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
      { model: ArqueoPago, as: 'arqueo', attributes: ['id', 'estado'] }
    ]
  }
];

const estadoCalculado = (concepto, total) => {
  if (!concepto.activo) return 'Anulado';
  if (concepto.exonerado) return 'Exonerado';
  const esperado = money(concepto.monto_esperado);
  if (total <= 0) return 'Pendiente';
  if (total < esperado) return 'Parcial';
  if (total > esperado) return 'Saldo a favor';
  return 'Pagado';
};

const resumenConcepto = (concepto) => {
  const json = concepto.toJSON ? concepto.toJSON() : concepto;
  const activos = (json.movimientos || []).filter((item) => item.estado === 'Activo');
  const totalPagado = money(activos.reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const saldo = money(Math.max(Number(json.monto_esperado || 0) - totalPagado, 0));
  const ultimo = [...activos].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))[0];
  return {
    ...json,
    total_pagado: totalPagado,
    saldo_pendiente: saldo,
    estado: estadoCalculado(json, totalPagado),
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

const importarSesiones = async () => {
  const sesiones = await Sesion.findAll({
    where: { anulada: false },
    include: [{ model: HistoriaClinica, as: 'historia_clinica', required: true, where: { anulada: false } }]
  });
  for (const sesion of sesiones) {
    const [concepto, creado] = await ConceptoCobro.findOrCreate({
      where: { sesion_id: sesion.id },
      defaults: {
        paciente_id: sesion.paciente_id,
        historia_clinica_id: sesion.historia_clinica_id,
        fecha_origen: sesion.fecha,
        tipo: 'Sesión de fisioterapia',
        detalle: `Sesión ${sesion.numero_sesion}${sesion.historia_clinica?.diagnostico_medico ? ` — ${sesion.historia_clinica.diagnostico_medico}` : ''}`,
        monto_esperado: money(sesion.monto_sesion),
        profesional_responsable: sesion.profesional_responsable,
        activo: true
      }
    });
    if (!creado) {
      await concepto.update({
        paciente_id: sesion.paciente_id,
        historia_clinica_id: sesion.historia_clinica_id,
        fecha_origen: sesion.fecha,
        monto_esperado: money(sesion.monto_sesion),
        profesional_responsable: sesion.profesional_responsable,
        activo: !sesion.anulada
      });
    }
    if (creado && money(sesion.monto_pagado) > 0 && sesion.usuario_id) {
      const movimientoImportado = await MovimientoPago.create({
        concepto_cobro_id: concepto.id,
        usuario_receptor_id: sesion.usuario_id,
        fecha: sesion.fecha,
        hora: '12:00:00',
        monto: money(sesion.monto_pagado),
        metodo: validMethods.includes(sesion.metodo_pago) ? sesion.metodo_pago : 'Otro',
        observacion: 'Pago histórico importado desde la sesión',
        numero_recibo: `REC-${String(concepto.id).padStart(6, '0')}-1`,
        estado: 'Activo'
      });
      await MovimientoPagoAuditoria.create({
        movimiento_pago_id: movimientoImportado.id,
        usuario_id: sesion.usuario_id,
        accion: 'Importación histórica',
        motivo: 'Migración desde el pago previamente registrado en la sesión',
        valor_nuevo: movimientoImportado.toJSON()
      });
    }
    await sincronizarSesion(concepto.id);
  }
};

const matches = (item, query) => {
  const search = String(query.buscar || '').trim().toLowerCase();
  if (query.desde && item.fecha_origen < query.desde) return false;
  if (query.hasta && item.fecha_origen > query.hasta) return false;
  if (query.estado && query.estado !== 'Todos' && item.estado !== query.estado) return false;
  if (query.deuda === 'true' && item.saldo_pendiente <= 0) return false;
  if (query.metodo && query.metodo !== 'Todos' && !item.movimientos.some((m) => m.estado === 'Activo' && m.metodo === query.metodo)) return false;
  if (query.receptor && !item.movimientos.some((m) => String(m.usuario_receptor_id) === String(query.receptor))) return false;
  if (!search) return true;
  const text = [item.paciente?.nombres, item.paciente?.apellidos, item.paciente?.ci, item.paciente?.telefono, item.historia_clinica?.diagnostico_medico, item.detalle, ...item.movimientos.flatMap((m) => [m.numero_recibo, m.numero_comprobante, m.observacion])].filter(Boolean).join(' ').toLowerCase();
  return text.includes(search);
};

const buildIndicators = (items) => {
  const active = items.filter((item) => item.estado !== 'Anulado');
  const movements = active.flatMap((item) => item.movimientos.filter((m) => m.estado === 'Activo'));
  const byMethod = (method) => money(movements.filter((m) => m.metodo === method).reduce((sum, m) => sum + Number(m.monto), 0));
  return {
    total_esperado: money(active.reduce((sum, item) => sum + Number(item.monto_esperado), 0)),
    total_cobrado: money(movements.reduce((sum, item) => sum + Number(item.monto), 0)),
    total_pendiente: money(active.reduce((sum, item) => sum + item.saldo_pendiente, 0)),
    efectivo: byMethod('Efectivo'), qr: byMethod('QR'), transferencia: byMethod('Transferencia'), tarjeta: byMethod('Tarjeta'),
    pacientes_deuda: new Set(active.filter((item) => item.saldo_pendiente > 0).map((item) => item.paciente_id)).size,
    parciales: active.filter((item) => item.estado === 'Parcial').length,
    pendientes: active.filter((item) => item.estado === 'Pendiente').length,
    movimientos: movements.length
  };
};

exports.listar = async (req, res, next) => {
  try {
    await importarSesiones();
    if (req.query.desde && req.query.hasta && req.query.desde > req.query.hasta) return res.status(400).json({ message: 'La fecha desde no puede ser posterior a la fecha hasta.' });
    const rows = await ConceptoCobro.findAll({ include: includeConcepto, order: [['fecha_origen', 'DESC'], ['id', 'DESC']] });
    const items = rows.map(resumenConcepto).filter((item) => matches(item, req.query));
    res.json({ items, indicadores: buildIndicators(items) });
  } catch (error) { next(error); }
};

exports.crearConcepto = async (req, res, next) => {
  try {
    if (!req.body.paciente_id || !req.body.fecha_origen || !req.body.detalle) return res.status(400).json({ message: 'Paciente, fecha y concepto son obligatorios.' });
    if (money(req.body.monto_esperado) < 0) return res.status(400).json({ message: 'El monto esperado no puede ser negativo.' });
    const concepto = await ConceptoCobro.create({ ...req.body, monto_esperado: money(req.body.monto_esperado), estado: req.body.exonerado ? 'Exonerado' : 'Pendiente' });
    res.status(201).json({ message: 'Concepto de cobro registrado correctamente.', concepto });
  } catch (error) { next(error); }
};

exports.registrarMovimiento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const concepto = await ConceptoCobro.findByPk(req.params.conceptoId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!concepto || !concepto.activo) throw Object.assign(new Error('Concepto de cobro no disponible.'), { status: 404 });
    const monto = money(req.body.monto);
    if (monto <= 0 || !validMethods.includes(req.body.metodo)) throw Object.assign(new Error('Ingrese un monto mayor a cero y un método válido.'), { status: 400 });
    const movimientosActuales = await MovimientoPago.findAll({ where: { concepto_cobro_id: concepto.id }, transaction });
    const actual = resumenConcepto({ ...concepto.toJSON(), movimientos: movimientosActuales.map((item) => item.toJSON()) });
    if (monto > actual.saldo_pendiente && req.usuario.rol !== 'admin') throw Object.assign(new Error('El monto no puede superar el saldo pendiente.'), { status: 400 });
    const movimiento = await MovimientoPago.create({
      concepto_cobro_id: concepto.id,
      usuario_receptor_id: req.body.usuario_receptor_id || req.usuario.id,
      fecha: req.body.fecha || today(), hora: req.body.hora || nowTime(), monto, metodo: req.body.metodo,
      numero_comprobante: req.body.numero_comprobante || null, archivo_comprobante: req.body.archivo_comprobante || null,
      observacion: req.body.observacion || null, numero_recibo: `REC-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`
    }, { transaction });
    await MovimientoPagoAuditoria.create({ movimiento_pago_id: movimiento.id, usuario_id: req.usuario.id, accion: 'Registro inicial', valor_nuevo: movimiento.toJSON() }, { transaction });
    const resumen = await sincronizarSesion(concepto.id, transaction);
    await transaction.commit();
    res.status(201).json({ message: 'Pago registrado correctamente.', movimiento, resumen });
  } catch (error) { await transaction.rollback(); if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
};

exports.editarMovimiento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const movimiento = await MovimientoPago.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!movimiento) throw Object.assign(new Error('Movimiento no encontrado.'), { status: 404 });
    const arqueo = movimiento.arqueo_id ? await ArqueoPago.findByPk(movimiento.arqueo_id, { transaction }) : null;
    if (arqueo?.estado === 'Cerrado' && req.usuario.rol !== 'admin') throw Object.assign(new Error('Este pago pertenece a un arqueo cerrado.'), { status: 403 });
    if (arqueo?.estado === 'Cerrado' && !req.body.motivo) throw Object.assign(new Error('El motivo de corrección es obligatorio.'), { status: 400 });
    const anterior = movimiento.toJSON();
    const monto = money(req.body.monto);
    if (monto <= 0 || !validMethods.includes(req.body.metodo)) throw Object.assign(new Error('Ingrese un monto mayor a cero y un método válido.'), { status: 400 });
    await movimiento.update({ fecha: req.body.fecha, hora: req.body.hora, monto, metodo: req.body.metodo, numero_comprobante: req.body.numero_comprobante || null, archivo_comprobante: req.body.archivo_comprobante || null, usuario_receptor_id: req.body.usuario_receptor_id || movimiento.usuario_receptor_id, observacion: req.body.observacion || null }, { transaction });
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
    const concepts = (await ConceptoCobro.findAll({ include: includeConcepto, transaction })).map(resumenConcepto).filter((item) => item.fecha_origen >= req.body.fecha_desde && item.fecha_origen <= req.body.fecha_hasta && item.estado !== 'Anulado');
    const indicators = buildIndicators(concepts);
    const confirmed = money(req.body.efectivo_contado) + money(req.body.qr_confirmado) + money(req.body.transferencia_confirmada) + money(req.body.tarjeta_confirmada);
    const diferencia = money(confirmed - indicators.total_cobrado);
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
