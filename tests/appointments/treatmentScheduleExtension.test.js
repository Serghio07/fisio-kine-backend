const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const controller = readFileSync(resolve(__dirname, '../../src/controllers/cita.controller.js'), 'utf8');
const routes = readFileSync(resolve(__dirname, '../../src/routes/cita.routes.js'), 'utf8');
const treatmentPlan = readFileSync(resolve(__dirname, '../../src/services/treatmentPlan.service.js'), 'utf8');
const expansionService = readFileSync(resolve(__dirname, '../../src/services/treatmentPlanExpansion.service.js'), 'utf8');
const historyRoutes = readFileSync(resolve(__dirname, '../../src/routes/historiaClinica.routes.js'), 'utf8');
const migration = readFileSync(resolve(__dirname, '../../migrations/20260823000100-create-treatment-session-expansion-history.js'), 'utf8');

test('ampliar tratamiento conserva historia y actualiza totales relacionados', () => {
  assert.match(expansionService, /const totalNuevo = totalAnterior \+ incremento/);
  assert.match(expansionService, /HistorialAmpliacionSesiones\.create/);
  assert.match(expansionService, /synchronizeTreatmentTotal/);
  assert.match(treatmentPlan, /Cita\.update\(\{ total_sesiones: nextTotal \}/);
  assert.match(treatmentPlan, /Sesion\.update\(\{ sesiones_debe: nextTotal \}/);
  assert.match(treatmentPlan, /historia_clinica_id: historyId/);
  assert.match(treatmentPlan, /await sincronizarSemana\(session\.paciente_id, session\.fecha, transaction\)/);
});

test('resumen respeta el total editado y cuenta también horarios no asistidos', () => {
  assert.match(controller, /const indicadas = configuradas/);
  assert.doesNotMatch(controller, /Math\.max\(configuradas, maximoRelacionado\)/);
  assert.match(controller, /programadas: numerosActivos\.size/);
  assert.match(controller, /pendientes_programar: Math\.max\(indicadas - numerosCubiertos\.size, 0\)/);
});

test('ruta de ampliación exige rol clínico autorizado', () => {
  assert.match(historyRoutes, /\/:id\/ampliar-sesiones', autorizarRoles\('admin', 'personal'\), ampliarSesiones/);
  assert.doesNotMatch(routes, /programacion\/historia\/:id\/ampliar/);
});

test('ampliación admite motivo opcional, exige idempotencia y usa bloqueo transaccional', () => {
  assert.match(expansionService, /SIN MOTIVO ESPECIFICADO/);
  assert.match(expansionService, /Idempotency-Key es obligatorio/);
  assert.match(expansionService, /lock: transaction\.LOCK\.UPDATE/);
  assert.match(expansionService, /where: \{ solicitud_id: requestId \}/);
});

test('migración crea trazabilidad inmutable y rollback se bloquea si hay datos', () => {
  assert.match(migration, /historial_ampliaciones_sesiones/);
  assert.match(migration, /total_nuevo = total_anterior \+ incremento/);
  assert.match(migration, /ON DELETE|onDelete: 'RESTRICT'/i);
  assert.match(migration, /Rollback bloqueado/);
});
