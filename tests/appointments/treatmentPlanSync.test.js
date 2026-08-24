const test = require('node:test');
const assert = require('node:assert/strict');
const { Cita, EvaluacionFinal, Sesion } = require('../../src/models');
const { synchronizeTreatmentTotal } = require('../../src/services/treatmentPlan.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };

test('reducir el plan cancela citas excedentes y actualiza todos los totales', async () => {
  const originals = { sessionFind: Sesion.findAll, sessionUpdate: Sesion.update, appointmentUpdate: Cita.update, evaluationUpdate: EvaluacionFinal.update };
  const calls = [];
  Sesion.findAll = async () => [];
  const appointmentFind = Cita.findAll;
  Cita.findAll = async () => [{ id: 44 }];
  Sesion.update = async (value, options) => { calls.push(['session', value, options.where]); };
  Cita.update = async (value, options) => { calls.push(['appointment', value, options.where]); };
  EvaluacionFinal.update = async (value, options) => { calls.push(['evaluation', value, options.where]); };
  try {
    const result = await synchronizeTreatmentTotal({ historyId: 7, total: 3, transaction, changedBy: 'Doctor' });
    assert.ok(calls.some(([model, value]) => model === 'evaluation' && value.sesiones_contratadas === 3));
    assert.ok(calls.some(([model, value]) => model === 'appointment' && value.total_sesiones === 3));
    assert.ok(calls.some(([model, value]) => model === 'appointment' && value.estado === 'Cancelada'));
    assert.ok(calls.some(([model, value]) => model === 'session' && value.sesiones_debe === 3));
    assert.deepEqual(result.canceledAppointmentIds, [44]);
  } finally {
    Sesion.findAll = originals.sessionFind; Sesion.update = originals.sessionUpdate; Cita.findAll = appointmentFind; Cita.update = originals.appointmentUpdate; EvaluacionFinal.update = originals.evaluationUpdate;
  }
});

test('no permite reducir por debajo de una sesión atendida o con pagos', async () => {
  const original = Sesion.findAll;
  Sesion.findAll = async () => [{ numero_sesion: 4, asistencia: 'asistio', monto_pagado: 0, saldo_pendiente: 0 }];
  try {
    await assert.rejects(() => synchronizeTreatmentTotal({ historyId: 7, total: 3, transaction }), /sesión 4 tiene atención/u);
  } finally { Sesion.findAll = original; }
});
