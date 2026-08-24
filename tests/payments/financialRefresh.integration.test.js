const test = require('node:test');
const assert = require('node:assert/strict');
const { sequelize } = require('../../src/models');
const { calculatePaymentState } = require('../../src/services/paymentFinancialState.service');
const { buildPatientFinancialSummary } = require('../../src/services/patientFinancialSummary.service');
const { movementTotals } = require('../../src/services/movimientoCaja.service');
const { aggregatePeriod } = require('../../src/services/financialConsolidation.service');

const date = '2026-08-23';

test('fixture aislado actualiza pago, anulación, caja, resumen, consolidado y arqueo sin tocar PostgreSQL', async () => {
  const fixture = { payment: null, cash: [] };
  const originalQuery = sequelize.query;
  sequelize.query = async (sql) => {
    const active = fixture.payment?.estado === 'Activo' ? fixture.payment : null;
    if (sql.includes('COUNT(DISTINCT paciente_id)')) return { pacientes_atendidos: 0, sesiones_realizadas: 0 };
    if (sql.includes('FROM movimientos_pago m JOIN')) return { total_cobrado: active?.monto || 0, efectivo: 0, qr: active?.metodo === 'QR' ? active.monto : 0, transferencia: 0, tarjeta: 0, otro: 0, fisioterapia: active?.monto || 0, otros_servicios: 0 };
    if (sql.includes('FROM conceptos_cobro c LEFT JOIN')) return { deuda_vigente_actual: active ? 70 : 100, deuda_originada_periodo: active ? 70 : 100 };
    if (sql.includes('SELECT tipo_movimiento')) return fixture.cash.filter((row) => row.estado === 'ACTIVO');
    if (sql.includes('FROM arqueos_pago')) return { cantidad_cierres: 0, cuadrados: 0, con_diferencia: 0, diferencias: 0 };
    if (sql.includes('COUNT(DISTINCT fecha)')) return { dias: active || fixture.cash.some((row) => row.estado === 'ACTIVO') ? 1 : 0 };
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  const snapshot = async () => {
    const active = fixture.payment?.estado === 'Activo' ? [fixture.payment] : [];
    const paid = active.reduce((sum, row) => sum + row.monto, 0);
    const planilla = calculatePaymentState({ monto_esperado: 100, activo: true, exonerado: false, estado: 'Pendiente' }, paid);
    const patient = buildPatientFinancialSummary({ concepts: [{ id: 1, monto_esperado: 100, activo: true, exonerado: false, estado: 'Pendiente', fecha_origen: date, movimientos: active }], sessionsPerformed: 0, periods: { hoy: date, semana_inicio: date, semana_fin: date, mes_inicio: date, mes_fin: date } });
    const cash = movementTotals(fixture.cash.filter((row) => row.estado === 'ACTIVO'));
    const summary = { cobros: paid, qr: active.filter((row) => row.metodo === 'QR').reduce((sum, row) => sum + row.monto, 0), ingresos_extraordinarios: cash.ingresos_extraordinarios, egresos: cash.egresos, resultado_neto_operativo: paid + cash.ingresos_extraordinarios - cash.egresos };
    const consolidated = await aggregatePeriod(date, date);
    const arqueo = { qr: summary.qr, efectivo: cash.ingresos_extraordinarios + cash.aportes - cash.egresos - cash.retiros };
    return { planilla, patient: patient.resumen, summary, consolidated, arqueo, cash };
  };
  try {
    fixture.payment = { id: 1, fecha: date, hora: '10:00:00', monto: 30, metodo: 'QR', estado: 'Activo' };
    let view = await snapshot();
    assert.deepEqual({ pagado: view.planilla.pagado, saldo: view.planilla.saldo }, { pagado: 30, saldo: 70 });
    assert.equal(view.patient.pagado_total, 30); assert.equal(view.patient.saldo_pendiente, 70);
    assert.equal(view.summary.cobros, 30); assert.equal(view.summary.qr, 30); assert.equal(view.consolidated.cobros.total_cobrado, 30); assert.equal(view.consolidated.cobros.qr, 30); assert.equal(view.arqueo.qr, 30);

    fixture.payment.estado = 'Anulado'; view = await snapshot();
    assert.deepEqual({ pagado: view.planilla.pagado, saldo: view.planilla.saldo }, { pagado: 0, saldo: 100 });
    assert.equal(view.patient.pagado_total, 0); assert.equal(view.summary.cobros, 0); assert.equal(view.consolidated.cobros.total_cobrado, 0); assert.equal(view.arqueo.qr, 0);

    fixture.cash.push({ tipo_movimiento: 'INGRESO_EXTRAORDINARIO', monto: 100, metodo: 'Efectivo', estado: 'ACTIVO' }); view = await snapshot();
    assert.equal(view.summary.ingresos_extraordinarios, 100); assert.equal(view.summary.resultado_neto_operativo, 100); assert.equal(view.consolidated.caja.ingresos_extraordinarios, 100); assert.equal(view.consolidated.cobros.total_cobrado, 0); assert.equal(view.arqueo.efectivo, 100);

    fixture.cash.push({ tipo_movimiento: 'EGRESO', categoria: 'INSUMOS', monto: 40, metodo: 'Efectivo', estado: 'ACTIVO' }); view = await snapshot();
    assert.equal(view.cash.egresos, 40); assert.equal(view.summary.resultado_neto_operativo, 60); assert.equal(view.consolidated.resultado.resultado_neto_operativo, 60); assert.equal(view.arqueo.efectivo, 60);

    fixture.cash.push({ tipo_movimiento: 'APORTE_CAJA', monto: 100, metodo: 'Efectivo', estado: 'ACTIVO' }); view = await snapshot();
    assert.equal(view.summary.resultado_neto_operativo, 60); assert.equal(view.consolidated.resultado.resultado_neto_operativo, 60); assert.equal(view.arqueo.efectivo, 160);

    fixture.cash.push({ tipo_movimiento: 'RETIRO_CAJA', monto: 50, metodo: 'Efectivo', estado: 'ACTIVO' }); view = await snapshot();
    assert.equal(view.cash.egresos, 40); assert.equal(view.summary.resultado_neto_operativo, 60); assert.equal(view.consolidated.resultado.resultado_neto_operativo, 60); assert.equal(view.arqueo.efectivo, 110);
  } finally { sequelize.query = originalQuery; }
});
