const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { financialPeriods, buildPatientFinancialSummary } = require('../../src/services/patientFinancialSummary.service');

const periods = financialPeriods('2026-08-22');
const movement = (monto, fecha, metodo = 'QR', extra = {}) => ({ monto, fecha, hora: extra.hora || '10:00:00', metodo, estado: extra.estado || 'Activo', ...extra });
const concept = (id, historiaId, expected, movements = [], extra = {}) => ({ id, paciente_id: 19, historia_clinica_id: historiaId, fecha_origen: '2026-08-01', tipo: 'Sesión de fisioterapia', detalle: `Concepto ${id}`, monto_esperado: expected, activo: true, exonerado: false, estado: 'Pendiente', movimientos: movements, ...extra });

test('períodos Bolivia usan lunes-domingo y mes calendario', () => {
  assert.deepEqual(periods, { hoy: '2026-08-22', semana_inicio: '2026-08-17', semana_fin: '2026-08-23', mes_inicio: '2026-08-01', mes_fin: '2026-08-31' });
});

test('resume hoy, semana, mes, total y excluye anulados y exonerados', () => {
  const result = buildPatientFinancialSummary({ periods, sessionsPerformed: 4, concepts: [
    concept(1, 10, 100, [movement(20, '2026-08-10', 'Efectivo'), movement(35, '2026-08-22'), movement(99, '2026-08-22', 'QR', { estado: 'Anulado' })]),
    concept(2, 10, 80, [movement(125, '2026-08-18')]),
    concept(3, 10, 50, [], { exonerado: true, estado: 'Exonerado' })
  ] });
  assert.deepEqual(result.resumen, { sesiones_realizadas: 4, total_esperado: 180, pagado_hoy: 35, pagado_semana: 160, pagado_mes: 180, pagado_total: 180, saldo_pendiente: 45 });
  assert.equal(result.conceptos[2].esperado, 0); assert.equal(result.conceptos[2].estado, 'Exonerado');
});

test('operación global usa monto padre una vez como último pago y movimientos hijos para totales', () => {
  const operation = { id: 7, fecha: '2026-08-22', hora: '20:18:00', monto_total: 35, metodo: 'QR', tipo: 'DEUDA_HISTORIA', estado: 'ACTIVA', numero_recibo: 'REC-1' };
  const concepts = [20, 5, 10].map((amount, index) => concept(index + 1, 10, amount, [movement(amount, '2026-08-22', 'QR', { hora: '20:18:00', operacion_pago_id: 7, operacion_pago: operation })]));
  const result = buildPatientFinancialSummary({ periods, concepts });
  assert.equal(result.resumen.pagado_total, 35); assert.equal(result.ultimo_pago.monto, 35); assert.equal(result.ultimo_pago.tipo, 'DEUDA_HISTORIA'); assert.equal(result.ultimo_pago.legacy, false);
});

test('agrupa métodos con porcentajes y conserva fallback legacy', () => {
  const result = buildPatientFinancialSummary({ periods, concepts: [concept(1, 10, 300, [movement(100, '2026-08-21', 'Efectivo', { numero_recibo: 'LEG-1' }), movement(200, '2026-08-22', 'QR')])] });
  assert.deepEqual(result.metodos.slice(0, 2), [{ metodo: 'Efectivo', monto: 100, porcentaje: 33.33 }, { metodo: 'QR', monto: 200, porcentaje: 66.67 }]);
  assert.equal(result.ultimo_pago.legacy, true); assert.equal(result.ultimo_pago.monto, 200);
});

test('endpoint es GET protegido, filtra historia y no ejecuta escrituras', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../../src/routes/planillaPagos.routes.js'), 'utf8');
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/planillaPagos.controller.js'), 'utf8');
  const body = controller.slice(controller.indexOf('exports.resumenFinancieroPaciente'), controller.indexOf('exports.crearConcepto'));
  assert.match(routes, /router\.get\('\/pacientes\/:pacienteId\/resumen-financiero'/);
  assert.match(body, /historia_clinica_id: historiaId/); assert.match(body, /asistencia: 'asistio'/); assert.match(body, /anulada: false/);
  assert.doesNotMatch(body, /\.create\(|\.update\(|\.destroy\(|sincronizar|importar/);
});
