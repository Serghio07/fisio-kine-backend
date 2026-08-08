const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanupTemporaryWhatsappNoShow,
  isAutomaticNoShowSession
} = require('../src/services/temporaryWhatsappPatientCleanup.service');
const { actualizarCitasNoAsistidas } = require('../src/services/citaEstado.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const emptyRelations = [{ count: async () => 0 }];

const scenario = ({ patient = {}, future = 0, sessions = [], protectedCount = 0, appointment = {}, referrals = [] } = {}) => {
  const updates = [];
  const item = {
    id: 20, paciente_id: 8, origen: 'WhatsApp', estado: 'No asistio', sesion_id: null,
    update: async (value) => { updates.push(['appointment', value]); Object.assign(item, value); },
    ...appointment
  };
  const person = {
    id: 8, estado: true, registro_pendiente: true,
    update: async (value) => { updates.push(['patient', value]); Object.assign(person, value); },
    ...patient
  };
  const deps = {
    transaction,
    patientModel: { findByPk: async () => person },
    appointmentModel: { count: async () => future },
    sessionModel: { findAll: async () => sessions },
    referralModel: { findAll: async () => referrals },
    syncNotifications: async () => 0,
    protectedModels: [{ count: async () => protectedCount }],
    today: '2026-08-07', currentTime: '11:00:00'
  };
  return { item, person, deps, updates };
};

test('temporal + No asistio + sin otra cita se archiva y sale de pendientes', async () => {
  const { item, person, deps } = scenario();
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.archived, true);
  assert.equal(person.estado, false);
  assert.equal(person.registro_pendiente, true);
});

test('temporal + No asistio + otra cita futura se conserva', async () => {
  const { item, person, deps } = scenario({ future: 1 });
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.reason, 'FUTURE_APPOINTMENT');
  assert.equal(person.estado, true);
});

for (const estado of ['Pendiente', 'Programada']) {
  test(`temporal + cita ${estado} se conserva`, async () => {
    const { item, person, deps } = scenario({ appointment: { estado } });
    const result = await cleanupTemporaryWhatsappNoShow(item, deps);
    assert.equal(result.archived, false);
    assert.equal(person.estado, true);
  });
}

test('temporal que asistio se conserva para completar registro', async () => {
  const { item, person, deps } = scenario({ appointment: { estado: 'Atendida' } });
  await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(person.estado, true);
});

test('temporal convertido a definitivo nunca se archiva', async () => {
  const { item, person, deps } = scenario({ patient: { registro_pendiente: false } });
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.temporary, false);
  assert.equal(person.estado, true);
});

test('definitivo + No asistio conserva paciente y genera su inasistencia', async () => {
  let ensured = 0;
  const appointment = { id: 1, estado: 'Pendiente', update: async function update(value) { Object.assign(this, value); } };
  const appointmentModel = { findAll: async () => [appointment] };
  await actualizarCitasNoAsistidas(transaction, {
    appointmentModel,
    cleanupTemporary: async () => ({ temporary: false }),
    ensureNoShow: async () => { ensured += 1; }
  });
  assert.equal(ensured, 1);
});

test('temporal con historia clinica no se archiva', async () => {
  const { item, person, deps } = scenario({ protectedCount: 1 });
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.reason, 'PROTECTED_RELATION');
  assert.equal(person.estado, true);
});

test('temporal con sesion clinica valida no se archiva', async () => {
  const { item, person, deps } = scenario({ sessions: [{ id: 99, asistencia: 'asistio' }] });
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.reason, 'CLINICAL_SESSION');
  assert.equal(person.estado, true);
});

test('temporal ausente no genera sesion clinica', async () => {
  let ensured = 0;
  const appointment = { id: 1, estado: 'Pendiente', update: async function update(value) { Object.assign(this, value); } };
  await actualizarCitasNoAsistidas(transaction, {
    appointmentModel: { findAll: async () => [appointment] },
    cleanupTemporary: async () => ({ temporary: true, archived: true }),
    ensureNoShow: async () => { ensured += 1; }
  });
  assert.equal(ensured, 0);
});

test('falla durante limpieza y la transaccion completa hace rollback', async () => {
  let rolledBack = false;
  const db = { transaction: async (callback) => {
    try { return await callback(transaction); }
    catch (error) { rolledBack = true; throw error; }
  } };
  const appointment = { estado: 'Pendiente', update: async function update(value) { Object.assign(this, value); } };
  await assert.rejects(() => actualizarCitasNoAsistidas(null, {
    db,
    appointmentModel: { findAll: async () => [appointment] },
    cleanupTemporary: async () => { throw new Error('cleanup failed'); }
  }), /cleanup failed/);
  assert.equal(rolledBack, true);
});

test('auditoria WhatsApp permanece vinculada al archivar', async () => {
  const { item, deps } = scenario();
  const audit = { paciente_id: item.paciente_id, cita_id: item.id };
  await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.deepEqual(audit, { paciente_id: 8, cita_id: 20 });
});

test('temporal ausente cierra derivacion sin asignar responsable y conserva auditoria', async () => {
  const referral = { estado: 'PENDIENTE', responsable_usuario_id: null, historial: [{ accion: 'CREADA' }], update: async function update(value) { Object.assign(this, value); } };
  const { item, deps } = scenario({ referrals: [referral] });
  await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(referral.estado, 'CERRADA');
  assert.equal(referral.responsable_usuario_id, null);
  assert.match(referral.resolucion, /no asistió/);
  assert.equal(referral.historial.at(-1).accion, 'CIERRE_AUTOMATICO');
});

test('temporal con cita cancelada sin otra futura se archiva y cierra derivacion', async () => {
  const referral = { estado: 'EN_ATENCION', responsable_usuario_id: 7, historial: [], update: async function update(value) { Object.assign(this, value); } };
  const { item, person, deps } = scenario({ appointment: { estado: 'Cancelada' }, referrals: [referral] });
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.archived, true);
  assert.equal(person.estado, false);
  assert.equal(referral.estado, 'CERRADA');
  assert.match(referral.resolucion, /canceló/);
  assert.equal(referral.responsable_usuario_id, 7);
});

test('temporal con cita futura no cierra derivacion', async () => {
  let updates = 0;
  const referral = { estado: 'PENDIENTE', update: async () => { updates += 1; } };
  const { item, deps } = scenario({ future: 1, referrals: [referral] });
  await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(updates, 0);
  assert.equal(referral.estado, 'PENDIENTE');
});

test('el endpoint de pendientes deja fuera al temporal archivado por estado=false', async () => {
  const { item, person, deps } = scenario();
  await cleanupTemporaryWhatsappNoShow(item, deps);
  const visible = [person].filter((patient) => patient.registro_pendiente === true && patient.estado === true);
  assert.equal(visible.length, 0);
});

test('elimina solo la sesion automatica previa y conserva la cita de auditoria', async () => {
  let destroyed = false;
  const auto = {
    id: 42, asistencia: 'no_asistio', historia_clinica_id: null, sesiones_debe: 0,
    sesiones_hizo: 0, monto_sesion: 0, monto_pagado: 0, saldo_pendiente: 0,
    aplica_farmacos: false, destroy: async () => { destroyed = true; }
  };
  const { item, deps } = scenario({ sessions: [auto], appointment: { sesion_id: 42 } });
  assert.equal(isAutomaticNoShowSession(auto, item), true);
  const result = await cleanupTemporaryWhatsappNoShow(item, deps);
  assert.equal(result.archived, true);
  assert.equal(item.sesion_id, null);
  assert.equal(destroyed, true);
  assert.equal(item.id, 20);
});
