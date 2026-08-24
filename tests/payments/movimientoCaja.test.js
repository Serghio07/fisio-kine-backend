const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validatePayload, movementTotals } = require('../../src/services/movimientoCaja.service');

const base = { fecha: '2026-08-22', hora: '10:30', concepto: 'Prueba', monto: 50, metodo: 'Efectivo' };

test('valida los seis tipos y conserva montos positivos', () => {
  for (const tipo_movimiento of ['INGRESO_EXTRAORDINARIO', 'EGRESO', 'APORTE_CAJA', 'RETIRO_CAJA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO']) {
    const payload = { ...base, tipo_movimiento, categoria: tipo_movimiento === 'EGRESO' ? 'MATERIAL_MEDICO' : null, motivo: tipo_movimiento.startsWith('AJUSTE_') ? 'Corrección' : null };
    assert.equal(validatePayload(payload).monto, 50);
  }
});

test('rechaza monto inválido, egreso sin categoría, aporte QR y ajuste sin motivo', () => {
  assert.throws(() => validatePayload({ ...base, tipo_movimiento: 'INGRESO_EXTRAORDINARIO', monto: 0 }), /mayor a cero/);
  assert.throws(() => validatePayload({ ...base, tipo_movimiento: 'EGRESO' }), /categoría válida/);
  assert.throws(() => validatePayload({ ...base, tipo_movimiento: 'APORTE_CAJA', metodo: 'QR' }), /sólo pueden/);
  assert.throws(() => validatePayload({ ...base, tipo_movimiento: 'AJUSTE_NEGATIVO' }), /motivo es obligatorio/);
  assert.throws(() => validatePayload({ ...base, tipo_movimiento: 'AJUSTE_POSITIVO', metodo: 'QR', motivo: 'Corrección' }), /sólo pueden registrarse en efectivo/);
});

test('separa retiro y aporte de ingresos y egresos operativos', () => {
  const totals = movementTotals([
    { tipo_movimiento: 'INGRESO_EXTRAORDINARIO', monto: 50 }, { tipo_movimiento: 'EGRESO', monto: 40 },
    { tipo_movimiento: 'APORTE_CAJA', monto: 100 }, { tipo_movimiento: 'RETIRO_CAJA', monto: 80 },
    { tipo_movimiento: 'AJUSTE_POSITIVO', monto: 5 }, { tipo_movimiento: 'AJUSTE_NEGATIVO', monto: 2 }
  ]);
  assert.deepEqual(totals, { ingresos_extraordinarios: 50, egresos: 40, aportes: 100, retiros: 80, ajustes_positivos: 5, ajustes_negativos: 2 });
});

test('retiros usan transacción, lock y saldo recalculado; anulaciones protegen cierres', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/services/movimientoCaja.service.js'), 'utf8');
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /calcularSaldoCaja\(valid\.fecha, \{ transaction \}\)/);
  assert.match(source, /No existe suficiente efectivo disponible/);
  assert.match(source, /pertenece a un arqueo cerrado/);
  assert.doesNotMatch(source, /MovimientoPago\.create/);
});
