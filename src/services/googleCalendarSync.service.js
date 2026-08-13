const { BOLIVIA_TIME_ZONE, BOLIVIA_UTC_OFFSET } = require('../utils/boliviaDateTime');
const googleCalendar = require('./googleCalendarService');

const safeMessage = (error) => String(error?.response?.data?.error?.message || error?.message || 'Error desconocido').slice(0, 300);
const eventBody = (cita) => {
  const name = [cita.paciente?.nombres, cita.paciente?.apellidos].filter(Boolean).join(' ').trim() || `Paciente ${cita.paciente_id}`;
  const start = String(cita.hora_inicio).slice(0, 8);
  const [hour, minute] = start.split(':').map(Number);
  const fallbackEnd = `${String((hour + Math.floor((minute + 60) / 60)) % 24).padStart(2, '0')}:${String((minute + 60) % 60).padStart(2, '0')}:00`;
  const end = cita.hora_fin ? String(cita.hora_fin).slice(0, 8) : fallbackEnd;
  const endDate = !cita.hora_fin && fallbackEnd <= start
    ? new Date(`${cita.fecha}T12:00:00Z`).toISOString().slice(0, 10).replace(/(\d{4})-(\d{2})-(\d{2})/, (_, y, m, d) => {
      const next = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + 1));
      return next.toISOString().slice(0, 10);
    })
    : cita.fecha;
  return {
    summary: `Physio Active - ${name}`,
    description: [cita.tipo_atencion, cita.motivo, cita.observacion].filter(Boolean).join('\n'),
    start: { dateTime: `${cita.fecha}T${start}${BOLIVIA_UTC_OFFSET}`, timeZone: BOLIVIA_TIME_ZONE },
    end: { dateTime: `${endDate}T${end}${BOLIVIA_UTC_OFFSET}`, timeZone: BOLIVIA_TIME_ZONE },
    extendedProperties: { private: { physio_active_cita_id: String(cita.id) } }
  };
};
const syncInFlight = new Map();
const performSync = async (cita) => {
  try {
    if (cita.estado === 'Cancelada') {
      // Una cancelacion puede llegar mientras la creacion del evento aun esta en curso.
      // Recargar permite obtener el google_event_id que esa operacion acaba de guardar.
      if (!cita.google_event_id && typeof cita.reload === 'function') await cita.reload();
      if (cita.google_event_id) {
        await googleCalendar.deleteEvent(cita.google_event_id);
        await cita.update({ google_event_id: null }, { hooks: false });
      }
      return;
    }
    if (cita.google_event_id) {
      try { return await googleCalendar.updateEvent(cita.google_event_id, eventBody(cita)); }
      catch (error) {
        if (error?.response?.status !== 404 && error?.code !== 404) throw error;
        await cita.update({ google_event_id: null }, { hooks: false });
      }
    }
    const response = await googleCalendar.createEvent(eventBody(cita));
    if (response.data.id) await cita.update({ google_event_id: response.data.id }, { hooks: false });
  } catch (error) {
    if (error.code === 'GOOGLE_CALENDAR_NOT_CONNECTED') return;
    console.error(`[Google Calendar] Error sincronizando cita: ${safeMessage(error)}`);
  }
};
const syncAppointment = (cita) => {
  const key = String(cita.id);
  const previous = syncInFlight.get(key) || Promise.resolve();
  // Las operaciones de una misma cita deben conservar el orden: crear/actualizar
  // primero y cancelar despues, incluso cuando llegan casi simultaneamente.
  const operation = previous.catch(() => undefined).then(() => performSync(cita));
  syncInFlight.set(key, operation);
  operation.finally(() => {
    if (syncInFlight.get(key) === operation) syncInFlight.delete(key);
  });
  return operation;
};
const deleteAppointmentEvent = async (eventId) => {
  if (!eventId) return;
  try { await googleCalendar.deleteEvent(eventId); }
  catch (error) {
    if (error?.response?.status === 404 || error?.code === 404 || error?.code === 'GOOGLE_CALENDAR_NOT_CONNECTED') return;
    console.error(`[Google Calendar] Error eliminando evento: ${safeMessage(error)}`);
  }
};

const syncAppointmentById = async (appointmentId) => {
  if (!appointmentId) return;
  const { Cita, Paciente } = require('../models');
  const cita = await Cita.findByPk(appointmentId, {
    include: [{ model: Paciente, as: 'paciente' }]
  });
  if (cita) await syncAppointment(cita);
};

module.exports = { eventBody, syncAppointment, syncAppointmentById, deleteAppointmentEvent };
