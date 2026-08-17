const test = require('node:test');
const assert = require('node:assert/strict');
const { getDashboardDailySummary } = require('../src/services/dashboardDailySummary.service');

const patient = (id, nombres) => ({ id, nombres, apellidos: 'PACIENTE' });
const modelsFor = (appointments = [], sessions = []) => {
  const calls = [];
  const readModel = (name, methods) => Object.fromEntries(Object.entries(methods).map(([method, result]) => [method, async (options) => { calls.push({ name, method, options }); return typeof result === 'function' ? result(options) : result; }]));
  return {
    calls,
    models: {
      Paciente: {},
      Cita: readModel('Cita', { findAll: appointments }),
      Sesion: readModel('Sesion', { findAll: sessions, count: sessions.length }),
      HistoriaClinica: readModel('HistoriaClinica', { count: 2 }),
      InformeMedico: readModel('InformeMedico', { count: 1 }),
      ActividadSistema: readModel('ActividadSistema', { count: 4 }),
      MovimientoPago: readModel('MovimientoPago', { count: 3 })
    }
  };
};

test('resume citas reales del día y ordena únicamente las próximas vigentes', async () => {
  const fixture = modelsFor([
    { id: 1, paciente_id: 1, hora_inicio: '08:00', estado: 'Atendida', numero_sesion: 3, total_sesiones: 10, paciente: patient(1, 'ANA') },
    { id: 2, paciente_id: 2, hora_inicio: '10:30', estado: 'Confirmada', paciente: patient(2, 'LUIS') },
    { id: 3, paciente_id: 3, hora_inicio: '11:00', estado: 'Cancelada', paciente: patient(3, 'MARIA') },
    { id: 4, paciente_id: 4, hora_inicio: '11:15', estado: 'No asistio', paciente: patient(4, 'JOSE') },
    { id: 5, paciente_id: 5, hora_inicio: '12:00', estado: 'Pendiente', paciente: patient(5, 'ELENA') }
  ], [{ id: 8, paciente_id: 1, numero_sesion: 3, paciente: patient(1, 'ANA') }]);
  const result = await getDashboardDailySummary({ id: 7, rol: 'admin' }, { models: fixture.models, now: new Date('2026-08-17T14:00:00Z') });
  assert.deepEqual(result.citas, { total: 5, atendidas: 1, pendientes: 2, noAsistio: 1, canceladas: 1 });
  assert.deepEqual(result.proximasCitas.map((item) => item.id), [2, 5]);
  assert.equal(result.alertas.some((item) => item.tipo === 'PROXIMA_CITA'), true);
  assert.deepEqual(result.pacientesAtendidos[0], { paciente: 'ANA PACIENTE', sesionActual: 3, totalSesiones: 10 });
});

test('día vacío devuelve ceros y nunca usa operaciones de escritura', async () => {
  const fixture = modelsFor([], []);
  const result = await getDashboardDailySummary({ id: 9, rol: 'personal' }, { models: fixture.models, now: new Date('2026-08-17T14:00:00Z') });
  assert.deepEqual(result.citas, { total: 0, atendidas: 0, pendientes: 0, noAsistio: 0, canceladas: 0 });
  assert.deepEqual(result.proximasCitas, []);
  assert.deepEqual(result.alertas, []);
  assert.equal('pagosRegistrados' in result.actividad, false);
  assert.equal(fixture.calls.every((call) => ['findAll', 'count'].includes(call.method)), true);
});

test('PERSONAL consulta citas y sesiones únicamente con su usuario', async () => {
  const fixture = modelsFor([], []);
  await getDashboardDailySummary({ id: 15, rol: 'personal' }, { models: fixture.models, now: new Date('2026-08-17T14:00:00Z') });
  const appointmentQuery = fixture.calls.find((call) => call.name === 'Cita');
  const sessionQuery = fixture.calls.find((call) => call.name === 'Sesion' && call.method === 'findAll');
  assert.equal(appointmentQuery.options.where.profesional_id, 15);
  assert.equal(sessionQuery.options.where.usuario_id, 15);
});
