const test = require('node:test');
const assert = require('node:assert/strict');
const { actualizarCitasNoAsistidas } = require('../src/services/citaEstado.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const appointment = (values = {}) => ({
  id: 78, paciente_id: 8, historia_clinica_id: 12, fecha: '2026-08-14', numero_sesion: 14,
  estado: 'Programada', sesion_id: null,
  update: async function update(data) { Object.assign(this, data); },
  ...values
});

const run = async ({ item, exactSession = null, dateSessions = [] }) => {
  let appointmentReads = 0; let noShows = 0;
  const appointmentModel = {
    findAll: async () => (++appointmentReads === 1 ? [item] : []),
    findOne: async () => null
  };
  const sessionModel = {
    findOne: async () => exactSession,
    findAll: async () => dateSessions
  };
  await actualizarCitasNoAsistidas(transaction, {
    appointmentModel, sessionModel,
    cleanupTemporary: async () => ({ temporary: false }),
    ensureNoShow: async () => { noShows += 1; }
  });
  return noShows;
};

for (const label of ['antes del horario', 'durante el horario']) {
  test(`una sesión realizada ${label} prevalece sobre la inasistencia automática`, async () => {
    const item = appointment();
    const noShows = await run({ item, exactSession: { id: 140, asistencia: 'asistio' } });
    assert.equal(item.estado, 'Atendida');
    assert.equal(item.sesion_id, 140);
    assert.equal(noShows, 0);
  });
}

test('sin sesión realizada la cita finalizada pasa a No asistio una sola vez', async () => {
  const item = appointment();
  const noShows = await run({ item });
  assert.equal(item.estado, 'No asistio');
  assert.equal(noShows, 1);
});

test('una sesión única del mismo paciente, historia y fecha corrige numeración histórica desfasada', async () => {
  const item = appointment();
  await run({ item, dateSessions: [{ id: 141, numero_sesion: 13, asistencia: 'asistio' }] });
  assert.deepEqual({ estado: item.estado, sesion_id: item.sesion_id }, { estado: 'Atendida', sesion_id: 141 });
});
