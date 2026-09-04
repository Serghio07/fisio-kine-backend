const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Op } = require('sequelize');
const { ArqueoPago } = require('../../src/models');
const { applyOpening, debtSummaryFromRows, pendingObligations, historicalObligations, normalizeConfirmations, openingFromPrevious, previousClosing, closedCurrent } = require('../../src/services/arqueoCaja.service');

const systems = { Efectivo: 300, QR: 100, Transferencia: 0, Tarjeta: 0, Otro: 0 };

test('cierre anterior con Bs 300 define automáticamente la apertura en Bs 300', () => {
  const result = openingFromPrevious({ id: 8, numero_arqueo: 'ARQ-8', fecha_operativa: '2026-08-22', saldo_dejado_caja: 300 });
  assert.equal(result.saldo_inicial_efectivo, 300);
  assert.equal(result.requiere_saldo_inicial_manual, false);
  assert.equal(result.apertura_pendiente, false);
  assert.equal(result.saldo_inicial_origen.id, 8);
});

test('cierre del 22/08 con Bs 250 inicia el 23/08 con Bs 250 y conserva la fecha de origen', () => {
  const result = openingFromPrevious({ id: 7, numero_arqueo: 'ARQ-7', fecha_operativa: '2026-08-22', saldo_dejado_caja: 250 });
  assert.equal(result.saldo_inicial_efectivo, 250);
  assert.equal(result.saldo_inicial_origen.fecha_operativa, '2026-08-22');
});

test('cierre del 23/08 con Bs 300 inicia el 24/08 con Bs 300', () => {
  const result = openingFromPrevious({ id: 8, numero_arqueo: 'ARQ-8', fecha_operativa: '2026-08-23', saldo_dejado_caja: 300 });
  assert.equal(result.saldo_inicial_efectivo, 300);
  assert.equal(result.saldo_inicial_origen.fecha_operativa, '2026-08-23');
});

test('arqueo actual cerrado muestra los importes guardados y no un recálculo vacío', () => {
  const result = closedCurrent({ id: 2, estado: 'Cerrado', fecha_operativa: '2026-08-23', saldo_inicial_efectivo: 0, efectivo_sistema: 680, efectivo_contado: 680, monto_retirado: 680, saldo_dejado_caja: 0, total_cobrado: 680, snapshot_resumen: { saldo_inicial_efectivo: 0, total_cobrado: 680, efectivo_esperado_cierre: 680, sistemas: { Efectivo: 680, QR: 1000, Transferencia: 0, Tarjeta: 0, Otro: 0 }, total_sistema: 1680, apertura_pendiente: false } });
  assert.equal(result.cerrado, true);
  assert.equal(result.total_cobrado, 680);
  assert.equal(result.sistemas.Efectivo, 680);
  assert.equal(result.efectivo_esperado_cierre, 680);
  assert.equal(result.arqueo.estado, 'Cerrado');
});

test('sin cierre anterior habilita únicamente la apertura manual', () => {
  const result = openingFromPrevious(null);
  assert.equal(result.saldo_inicial_efectivo, 0);
  assert.equal(result.requiere_saldo_inicial_manual, true);
  assert.equal(result.apertura_pendiente, true);
  assert.equal(result.saldo_inicial_origen, null);
});

test('la búsqueda del cierre anterior excluye registros sin fecha operativa', async () => {
  const original = ArqueoPago.findOne;
  let options;
  ArqueoPago.findOne = async (value) => { options = value; return null; };
  try { await previousClosing('2026-08-23'); } finally { ArqueoPago.findOne = original; }
  assert.equal(options.where.estado, 'Cerrado');
  assert.equal(options.where.fecha_operativa[Op.lt], '2026-08-23');
  assert.equal(options.where.fecha_operativa[Op.ne], null);
  assert.equal(options.where.saldo_dejado_caja[Op.ne], null);
});

test('confirmación vacía no se interpreta como cero cuando existe saldo de sistema', () => {
  assert.throws(() => normalizeConfirmations({ efectivo_contado: 300 }, systems, true), /Pendiente de confirmar: QR/);
});

test('un método sin movimientos puede confirmarse automáticamente en cero', () => {
  const result = normalizeConfirmations({ efectivo_contado: 300, qr_confirmado: 100 }, systems, true);
  assert.equal(result.transferencia_confirmada, 0);
  assert.equal(result.tarjeta_confirmada, 0);
  assert.equal(result.otro_confirmado, 0);
});

test('cierre profesional protege concurrencia, snapshots, retiro e histórico', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/arqueoCaja.service.js'), 'utf8');
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /ArqueoMovimientoSnapshot\.bulkCreate/);
  assert.match(source, /ArqueoMovimientoCajaSnapshot\.bulkCreate/);
  assert.match(source, /origen: 'CIERRE_ARQUEO'/);
  assert.match(source, /existen cierres posteriores que dependen de su saldo/);
  assert.match(source, /snapshot_resumen/);
});

test('snapshot caja impide que un movimiento vivo pertenezca a dos arqueos', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../migrations/20260824000400-create-arqueo-movimientos-caja-snapshot.js'), 'utf8');
  assert.match(migration, /CREATE UNIQUE INDEX arqueo_mov_caja_snapshot_movimiento_unique[\s\S]*WHERE movimiento_caja_id IS NOT NULL/);
});

test('deuda se calcula por concepto sin compensar sobrepagos', () => {
  const result = debtSummaryFromRows([
    { paciente_id: 1, historia_clinica_id: 10, monto_esperado: 100, total_pagado: 120 },
    { paciente_id: 2, historia_clinica_id: 20, monto_esperado: 100, total_pagado: 50 }
  ]);
  assert.equal(result.total_pendiente, 50);
  assert.equal(result.pacientes_deuda, 1);
});

test('agrupa conceptos con deuda por paciente e historia e ignora concepto cero', () => {
  const result = debtSummaryFromRows([
    { paciente_id: 1, historia_clinica_id: 10, monto_esperado: 20, total_pagado: 0 },
    { paciente_id: 1, historia_clinica_id: 10, monto_esperado: 5, total_pagado: 0 },
    { paciente_id: 1, historia_clinica_id: 10, monto_esperado: 10, total_pagado: 0 },
    { paciente_id: 2, historia_clinica_id: 20, monto_esperado: 0, total_pagado: 0 }
  ]);
  assert.equal(result.total_pendiente, 35); assert.equal(result.pacientes_deuda, 1); assert.equal(result.deudores[0].deuda, 35);
});

test('snapshot histórico conserva el pago parcial aunque existan pagos posteriores', () => {
  const frozen = [{ montoEsperado: 300, montoPagado: 100, saldoPendiente: 200, estadoReporte: 'PENDIENTE' }];
  const currentAfterLaterPayment = [{ montoEsperado: 300, montoPagado: 300, saldoPendiente: 0, estadoReporte: 'CANCELADO' }];
  const result = historicalObligations({ obligaciones_no_canceladas: frozen }, currentAfterLaterPayment);
  assert.equal(result.fuenteObligacionesNoCanceladas, 'SNAPSHOT');
  assert.deepEqual(result.obligacionesNoCanceladas, frozen);
  assert.equal(result.obligacionesNoCanceladas[0].saldoPendiente, 200);
});

test('arqueo antiguo sin snapshot identifica el detalle como reconstruido y conserva solo saldos pendientes', () => {
  const reconstructed = [
    { montoEsperado: 300, montoPagado: 100, saldoPendiente: 200, estadoReporte: 'PENDIENTE' },
    { montoEsperado: 100, montoPagado: 100, saldoPendiente: 0, estadoReporte: 'CANCELADO' }
  ];
  const result = historicalObligations({ total_pendiente: 7740, pacientes_deuda: 9 }, reconstructed);
  assert.equal(result.fuenteObligacionesNoCanceladas, 'RECONSTRUIDO');
  assert.deepEqual(result.obligacionesNoCanceladas, [reconstructed[0]]);
});

test('cierre congela no cancelados y parciales y GET histórico permanece solo lectura', () => {
  assert.deepEqual(pendingObligations([
    { saldoPendiente: 200, estadoReporte: 'PENDIENTE' },
    { saldoPendiente: 70, estadoReporte: 'NO CANCELADO' },
    { saldoPendiente: 0, estadoReporte: 'CANCELADO' }
  ]).map((row) => row.estadoReporte), ['PENDIENTE', 'NO CANCELADO']);
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/arqueoCaja.service.js'), 'utf8');
  const detailSource = source.slice(source.indexOf('const detail ='), source.indexOf('const reopen ='));
  assert.doesNotMatch(detailSource, /\.update\(|\.create\(|bulkCreate|INSERT|UPDATE|destroy/i);
  assert.match(detailSource, /periodObligations\(historical\.fecha_operativa, historical\.fecha_operativa\)/);
});

test('apertura manual recalcula efectivo y total sistema antes de cerrar', () => {
  const result = applyOpening({ requiere_saldo_inicial_manual: true, apertura_pendiente: true, saldo_inicial_efectivo: 0,
    efectivo_esperado_cierre: 510, sistemas: { Efectivo: 510, QR: 0, Transferencia: 0, Tarjeta: 0, Otro: 0 }, total_sistema: 510 }, 100);
  assert.equal(result.efectivo_esperado_cierre, 610); assert.equal(result.total_sistema, 610); assert.equal(result.apertura_pendiente, false);
});

test('GET financieros no invocan importación de sesiones y preview es autoritativo', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/planillaPagos.controller.js'), 'utf8');
  const listBody = controller.slice(controller.indexOf('exports.listar ='), controller.indexOf('exports.resumenFinanciero ='));
  const summaryBody = controller.slice(controller.indexOf('exports.resumenFinanciero ='), controller.indexOf('exports.crearConcepto ='));
  assert.doesNotMatch(listBody, /importarSesiones\(/); assert.doesNotMatch(summaryBody, /importarSesiones\(/);
  assert.match(controller, /exports\.previewArqueo/);
});

test('consolidado preserva ceros válidos del snapshot', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/arqueoCaja.service.js'), 'utf8');
  assert.match(source, /s\.sistemas\?\.QR \?\? row\.qr_sistema/);
  assert.match(source, /responsable_nombre_snapshot/);
});
