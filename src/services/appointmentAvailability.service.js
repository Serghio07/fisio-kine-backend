const { Op } = require('sequelize');
const { Cita, Personal, Usuario } = require('../models');
const { BLOCKING_APPOINTMENT_STATUSES } = require('../models/Cita');
const {
  getWhatsappAppointmentDurationMinutes, getWhatsappSlotIntervalMinutes,
  getWhatsappMaxAvailableSlots, getWhatsappAvailabilitySearchDays
} = require('../config/whatsapp');

const TIME_ZONE = 'America/La_Paz';
const toMinutes = (time) => { const [h, m] = String(time).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const dateParts = (now = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
const todayIso = (now) => { const p = dateParts(now); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
const addDays = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const getBusinessPeriodsForDate = (date) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (day === 0) return [];
  if (day === 6) return [{ start: '09:00', end: '12:30', shift: 'MANANA' }];
  return [{ start: '09:00', end: '12:30', shift: 'MANANA' }, { start: '15:00', end: '19:30', shift: 'TARDE' }];
};

const generateCandidateSlots = ({ date, durationMinutes = 90, intervalMinutes = 30, now = new Date() }) => {
  const today = todayIso(now); const local = dateParts(now); const current = local.hour * 60 + local.minute;
  return getBusinessPeriodsForDate(date).flatMap((period) => {
    const slots = [];
    for (let start = toMinutes(period.start); start + durationMinutes <= toMinutes(period.end); start += intervalMinutes) {
      if (date === today && start <= current) continue;
      slots.push({ date, start: toTime(start), end: toTime(start + durationMinutes), shift: period.shift });
    }
    return slots;
  });
};

const isSlotOverlapping = (slot, appointment) => {
  const existingStart = toMinutes(appointment.hora_inicio);
  const start = toMinutes(slot.start); const end = toMinutes(slot.end);
  if (!appointment.hora_fin) return existingStart >= start && existingStart < end;
  return existingStart < end && toMinutes(appointment.hora_fin) > start;
};

const getActiveCenterCapacity = async ({ transaction, personalModel = Personal, userModel = Usuario } = {}) => {
  console.info('[WhatsApp] Consultando capacidad del centro');
  const count = await personalModel.count({
    distinct: true, col: 'usuario_id', where: { estado: 'activo', usuario_id: { [Op.ne]: null } },
    include: [{ model: userModel, as: 'usuario', required: true, attributes: [], where: { estado: 'activo', activo: true } }], transaction
  });
  console.info('[WhatsApp] Capacidad activa obtenida');
  return Number(count);
};

const getBlockingAppointments = ({ date, transaction, appointmentModel = Cita, excludeAppointmentId }) => appointmentModel.findAll({
  attributes: ['hora_inicio', 'hora_fin'],
  where: { fecha: date, estado: { [Op.in]: BLOCKING_APPOINTMENT_STATUSES }, ...(excludeAppointmentId ? { id: { [Op.ne]: excludeAppointmentId } } : {}) }, raw: true, transaction
});

const prioritizeSlots = (slots, preferredShift, preferredTime) => [...slots].sort((a, b) => {
  if (preferredTime) {
    const exactA = a.start === preferredTime ? 0 : 1; const exactB = b.start === preferredTime ? 0 : 1;
    if (exactA !== exactB) return exactA - exactB;
    const distance = (x) => Math.abs(toMinutes(x.start) - toMinutes(preferredTime));
    if (distance(a) !== distance(b)) return distance(a) - distance(b);
  }
  if (preferredShift && a.shift !== b.shift) return a.shift === preferredShift ? -1 : 1;
  return a.start.localeCompare(b.start);
});

const getAvailableSlots = async (options) => {
  const durationMinutes = options.durationMinutes || getWhatsappAppointmentDurationMinutes();
  const intervalMinutes = options.intervalMinutes || getWhatsappSlotIntervalMinutes(durationMinutes);
  const maxSlots = options.maxSlots || getWhatsappMaxAvailableSlots();
  const capacity = await getActiveCenterCapacity(options);
  if (capacity <= 0) return { date: options.date, capacity, durationMinutes, intervalMinutes, slots: [] };
  const appointments = await getBlockingAppointments(options);
  const candidates = generateCandidateSlots({ date: options.date, durationMinutes, intervalMinutes, now: options.now });
  console.info('[WhatsApp] Horarios candidatos generados');
  let available = candidates.filter((slot) => !appointments.some((item) => isSlotOverlapping(slot, item)));
  if (options.strictShift && options.preferredShift) available = available.filter((slot) => slot.shift === options.preferredShift);
  const slots = prioritizeSlots(available, options.preferredShift, options.preferredTime).slice(0, maxSlots).map((slot, index) => ({ option: index + 1, ...slot }));
  console.info('[WhatsApp] Horarios disponibles generados');
  return { date: options.date, capacity, durationMinutes, intervalMinutes, slots };
};

const revalidateSlotCapacity = async (options) => {
  const capacity = await getActiveCenterCapacity(options);
  if (capacity <= 0) return false;
  const appointments = await getBlockingAppointments({ ...options, date: options.slot.date });
  console.info('[WhatsApp] Capacidad revalidada');
  return !appointments.some((item) => isSlotOverlapping(options.slot, item));
};

const findAvailableDates = async (options = {}) => {
  const days = options.searchDays || getWhatsappAvailabilitySearchDays();
  const limit = options.limit || 4;
  const start = options.date || todayIso(options.now);
  const results = [];
  for (let offset = 0; offset <= days && results.length < limit; offset += 1) {
    const date = addDays(start, offset);
    if (!getBusinessPeriodsForDate(date).length) continue;
    const result = await getAvailableSlots({ ...options, date, maxSlots: 30 });
    if (result.slots.length) results.push({ date, shifts: [...new Set(result.slots.map((slot) => slot.shift))], slotCount: result.slots.length });
  }
  return results;
};

const findNextAvailableDate = async (options) => {
  const days = options.searchDays || getWhatsappAvailabilitySearchDays();
  for (let offset = 1; offset <= days; offset += 1) {
    const date = addDays(options.date, offset);
    if (!getBusinessPeriodsForDate(date).length) continue;
    const result = await getAvailableSlots({ ...options, date });
    if (result.slots.length) return result;
  }
  return null;
};

module.exports = {
  TIME_ZONE, BLOCKING_APPOINTMENT_STATUSES, toMinutes, toTime, todayIso, addDays,
  getBusinessPeriodsForDate, generateCandidateSlots, isSlotOverlapping,
  getActiveCenterCapacity, getBlockingAppointments, getAvailableSlots,
  revalidateSlotCapacity, findNextAvailableDate, findAvailableDates
};
