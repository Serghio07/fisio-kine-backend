const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOperationalScopes } = require('../src/services/assistant/operationalSummary.service');
const assistantRoutes = require('../src/routes/assistant.routes');

test('PERSONAL queda limitado a sus citas, sesiones y actividades', () => {
  const scopes = buildOperationalScopes({ id: 17, rol: 'personal' }, '2026-08-10');
  assert.deepEqual(scopes.appointmentScope, { fecha: '2026-08-10', profesional_id: 17 });
  assert.deepEqual(scopes.sessionScope, { fecha: '2026-08-10', anulada: false, usuario_id: 17 });
  assert.deepEqual(scopes.taskScope, { fecha: '2026-08-10', usuario_id: 17 });
});

test('ADMIN conserva alcance operativo global sin parámetros enviados por frontend', () => {
  const scopes = buildOperationalScopes({ id: 2, rol: 'admin' }, '2026-08-10');
  assert.deepEqual(scopes.appointmentScope, { fecha: '2026-08-10' });
  assert.deepEqual(scopes.sessionScope, { fecha: '2026-08-10', anulada: false });
  assert.deepEqual(scopes.taskScope, { fecha: '2026-08-10' });
});

test('el asistente mantiene lectura operativa y agrega únicamente el chat autenticado', () => {
  const methods = assistantRoutes.stack.filter((layer) => layer.route).flatMap((layer) => Object.keys(layer.route.methods));
  assert.deepEqual(methods, ['get', 'post']);
});
