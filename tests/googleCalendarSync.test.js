const assert = require('node:assert/strict');
const test = require('node:test');
const { eventBody } = require('../src/services/googleCalendarSync.service');

test('construye un evento en la zona horaria de Bolivia con datos reales de la cita', () => {
  const body = eventBody({
    id: 42,
    paciente_id: 7,
    paciente: { nombres: 'Ana', apellidos: 'Perez' },
    fecha: '2026-08-20',
    hora_inicio: '09:30:00',
    hora_fin: '10:15:00',
    tipo_atencion: 'Control',
    motivo: 'Seguimiento',
    observacion: null
  });
  assert.equal(body.summary, 'Physio Active - Ana Perez');
  assert.equal(body.start.dateTime, '2026-08-20T09:30:00-04:00');
  assert.equal(body.end.dateTime, '2026-08-20T10:15:00-04:00');
  assert.equal(body.start.timeZone, 'America/La_Paz');
  assert.equal(body.extendedProperties.private.physio_active_cita_id, '42');
});

test('usa una hora de duracion cuando hora_fin no existe', () => {
  const body = eventBody({ id: 1, paciente_id: 2, fecha: '2026-08-20', hora_inicio: '23:30:00' });
  assert.equal(body.end.dateTime, '2026-08-21T00:30:00-04:00');
});
