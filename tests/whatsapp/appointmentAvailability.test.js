const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BLOCKING_APPOINTMENT_STATUSES, getBusinessPeriodsForDate, generateCandidateSlots,
  isSlotOverlapping, getActiveCenterCapacity, getAvailableSlots,
  revalidateSlotCapacity, findNextAvailableDate
} = require('../../src/services/appointmentAvailability.service');
const config = require('../../src/config/whatsapp');
const { Cita } = require('../../src/models');
const { validarSolapamiento } = require('../../src/controllers/cita.controller');

test('configuracion de disponibilidad usa valores seguros', () => {
  const saved = { ...process.env };
  try {
    delete process.env.WHATSAPP_APPOINTMENT_DURATION_MINUTES;
    assert.equal(config.getWhatsappAppointmentDurationMinutes(), 90);
    process.env.WHATSAPP_APPOINTMENT_DURATION_MINUTES = '60';
    assert.equal(config.getWhatsappAppointmentDurationMinutes(), 60);
    process.env.WHATSAPP_APPOINTMENT_DURATION_MINUTES = '75';
    assert.equal(config.getWhatsappAppointmentDurationMinutes(), 90);
    delete process.env.WHATSAPP_SLOT_INTERVAL_MINUTES;
    delete process.env.WHATSAPP_MAX_AVAILABLE_SLOTS;
    delete process.env.WHATSAPP_SLOT_OPTIONS_TIMEOUT_MINUTES;
    delete process.env.WHATSAPP_AVAILABILITY_SEARCH_DAYS;
    assert.equal(config.getWhatsappSlotIntervalMinutes(90), 30);
    assert.equal(config.getWhatsappMaxAvailableSlots(), 5);
    assert.equal(config.getWhatsappSlotOptionsTimeoutMinutes(), 15);
    assert.equal(config.getWhatsappAvailabilitySearchDays(), 14);
    delete process.env.WHATSAPP_MAX_APPOINTMENTS_LIST;
    delete process.env.WHATSAPP_APPOINTMENT_LIST_TIMEOUT_MINUTES;
    assert.equal(config.getWhatsappMaxAppointmentsList(), 5);
    assert.equal(config.getWhatsappAppointmentListTimeoutMinutes(), 15);
    process.env.WHATSAPP_MAX_APPOINTMENTS_LIST = '1';
    assert.equal(config.getWhatsappMaxAppointmentsList(), 1);
    process.env.WHATSAPP_MAX_APPOINTMENTS_LIST = '10';
    assert.equal(config.getWhatsappMaxAppointmentsList(), 10);
    process.env.WHATSAPP_APPOINTMENT_LIST_TIMEOUT_MINUTES = '120';
    assert.equal(config.getWhatsappAppointmentListTimeoutMinutes(), 120);
  } finally { process.env = saved; }
});

test('horario oficial distingue semana, sabado y domingo', () => {
  assert.equal(getBusinessPeriodsForDate('2026-08-03').length, 2);
  assert.deepEqual(getBusinessPeriodsForDate('2026-08-08'), [{ start: '09:00', end: '12:30', shift: 'MANANA' }]);
  assert.deepEqual(getBusinessPeriodsForDate('2026-08-09'), []);
});

test('genera rangos completos de 90 minutos cada 30 sin cruzar cierres', () => {
  const slots = generateCandidateSlots({ date: '2026-08-03', durationMinutes: 90, intervalMinutes: 30, now: new Date('2026-08-01T12:00:00Z') });
  assert.deepEqual(slots.slice(0, 2).map((x) => [x.start, x.end]), [['09:00', '10:30'], ['09:30', '11:00']]);
  assert.equal(slots.some((x) => x.start === '12:00' || x.end > '19:30'), false);
  assert.equal(slots.some((x) => x.start < '15:00' && x.end > '12:30'), false);
});

test('hoy excluye inicios pasados en America La Paz', () => {
  const slots = generateCandidateSlots({ date: '2026-08-04', durationMinutes: 90, intervalMinutes: 30, now: new Date('2026-08-04T14:15:00Z') });
  assert.equal(slots.some((x) => x.start <= '10:15'), false);
});

test('detecta todos los solapamientos y permite adyacencia', () => {
  const slot = { start: '10:00', end: '11:30' };
  for (const item of [
    { hora_inicio: '10:00', hora_fin: '11:30' }, { hora_inicio: '09:30', hora_fin: '10:30' },
    { hora_inicio: '11:00', hora_fin: '12:00' }, { hora_inicio: '10:30', hora_fin: '11:00' },
    { hora_inicio: '09:00', hora_fin: '12:00' }, { hora_inicio: '10:30', hora_fin: null }
  ]) assert.equal(isSlotOverlapping(slot, item), true);
  assert.equal(isSlotOverlapping(slot, { hora_inicio: '11:30', hora_fin: '12:00' }), false);
});

test('estados bloqueantes son una fuente central estricta', () => {
  assert.deepEqual(BLOCKING_APPOINTMENT_STATUSES, ['Pendiente', 'Programada', 'Confirmada']);
});

test('validarSolapamiento reutiliza estados centrales', async () => {
  const original = Cita.findOne; const whereSeen = [];
  Cita.findOne = async ({ where }) => { whereSeen.push(where); return null; };
  try {
    assert.equal(await validarSolapamiento({ fecha: '2026-08-05', hora_inicio: '09:00', hora_fin: '10:30', estado: 'Reprogramada' }), null);
    assert.equal(whereSeen.length, 0);
    await validarSolapamiento({ fecha: '2026-08-05', hora_inicio: '09:00', hora_fin: '10:30', estado: 'Programada' });
    assert.equal(whereSeen.length, 1);
  } finally { Cita.findOne = original; }
});

test('capacidad cuenta usuarios distintos activos', async () => {
  let options;
  const count = await getActiveCenterCapacity({ personalModel: { count: async (value) => { options = value; return 3; } }, userModel: {} });
  assert.equal(count, 3); assert.equal(options.distinct, true); assert.equal(options.col, 'usuario_id'); assert.equal(options.include[0].required, true);
});

test('cualquier cita activa cruzada bloquea aunque exista capacidad general', async () => {
  const personalModel = { count: async () => 3 };
  const appointmentModel = { findAll: async () => [
    { hora_inicio: '15:00', hora_fin: '16:30', profesional_id: null },
    { hora_inicio: '15:00', hora_fin: '16:30' }
  ] };
  const result = await getAvailableSlots({ date: '2026-08-05', preferredShift: 'TARDE', durationMinutes: 90, intervalMinutes: 30, maxSlots: 5, now: new Date('2026-08-04T12:00:00Z'), personalModel, userModel: {}, appointmentModel });
  assert.equal(result.slots.length, 5); assert.notEqual(result.slots[0].start, '15:00');
  appointmentModel.findAll = async () => Array(3).fill({ hora_inicio: '15:00', hora_fin: '16:30', profesional_id: null });
  const full = await getAvailableSlots({ date: '2026-08-05', preferredTime: '15:00', durationMinutes: 90, intervalMinutes: 30, maxSlots: 5, now: new Date('2026-08-04T12:00:00Z'), personalModel, userModel: {}, appointmentModel });
  assert.notEqual(full.slots[0].start, '15:00');
});

test('aplica solapamiento de intervalos a los casos limite solicitados', () => {
  const existing0900 = { hora_inicio: '09:00', hora_fin: '10:00' };
  assert.equal(isSlotOverlapping({ start: '09:00', end: '10:30' }, existing0900), true);
  assert.equal(isSlotOverlapping({ start: '09:30', end: '11:00' }, existing0900), true);
  assert.equal(isSlotOverlapping({ start: '10:00', end: '11:30' }, existing0900), false);
  assert.equal(isSlotOverlapping({ start: '09:00', end: '10:30' }, { hora_inicio: '10:00', hora_fin: '11:30' }), true);
});

test('cita cancelada no entra en la consulta bloqueante', async () => {
  let where;
  const appointmentModel = { findAll: async (options) => { where = options.where; return []; } };
  const result = await getAvailableSlots({ date: '2026-08-08', durationMinutes: 90, intervalMinutes: 30, now: new Date('2026-08-04T12:00:00Z'), personalModel: { count: async () => 1 }, userModel: {}, appointmentModel });
  assert.equal(result.slots.some((slot) => slot.start === '09:00'), true);
  assert.deepEqual(where.estado[require('sequelize').Op.in], ['Pendiente', 'Programada', 'Confirmada']);
  assert.equal(where.estado[require('sequelize').Op.in].includes('Cancelada'), false);
});

test('sábado con cita 09:00 a 10:00 excluye solamente candidatos cruzados', async () => {
  const result = await getAvailableSlots({
    date: '2026-08-08', durationMinutes: 90, intervalMinutes: 30, maxSlots: 10,
    now: new Date('2026-08-04T12:00:00Z'), personalModel: { count: async () => 3 }, userModel: {},
    appointmentModel: { findAll: async () => [{ hora_inicio: '09:00', hora_fin: '10:00' }] }
  });
  assert.deepEqual(result.slots.map((slot) => slot.start), ['10:00', '10:30', '11:00']);
});

test('revalidacion y siguiente fecha respetan capacidad', async () => {
  assert.equal(await revalidateSlotCapacity({ slot: { date: '2026-08-05', start: '09:00', end: '10:30' }, personalModel: { count: async () => 1 }, userModel: {}, appointmentModel: { findAll: async () => [] } }), true);
  let calls = 0;
  const next = await findNextAvailableDate({ date: '2026-08-08', searchDays: 2, get ignored() { return null; }, personalModel: { count: async () => 1 }, userModel: {}, appointmentModel: { findAll: async () => { calls += 1; return []; } }, now: new Date('2026-08-04T12:00:00Z') });
  assert.equal(next.date, '2026-08-10'); assert.equal(calls, 1);
});
