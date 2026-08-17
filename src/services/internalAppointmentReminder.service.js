const { Op } = require('sequelize');
const { Cita, Paciente } = require('../models');
const notifications = require('./internalNotification.service');
const { activeUsers } = require('./whatsappNotificationTrigger.service');
const { boliviaDate } = require('../utils/boliviaDateTime');
const { getInternalNotificationsEnabled } = require('../config/whatsapp');

const ELIGIBLE_STATES = Object.freeze(['Pendiente', 'Programada', 'Confirmada']);
const REMINDER_MINUTES = 5;
const DELIVERY_WINDOW_MS = 60_000;
const appointmentInstant = (item) => new Date(`${item.fecha}T${String(item.hora_inicio).slice(0, 8)}-04:00`);
const scheduleToken = (item) => `${item.fecha}:${String(item.hora_inicio).slice(0, 5)}`;
const patientName = (patient) => [patient?.nombres, patient?.apellidos].filter(Boolean).join(' ').trim() || 'Paciente';
const isDue = (item, now) => {
  if (!ELIGIBLE_STATES.includes(item.estado)) return false;
  const delta = appointmentInstant(item).getTime() - now.getTime();
  return delta > (REMINDER_MINUTES * 60_000 - DELIVERY_WINDOW_MS) && delta <= REMINDER_MINUTES * 60_000;
};

const processInternalAppointmentReminders = async ({
  now = new Date(),
  appointmentModel = Cita,
  patientModel = Paciente,
  userModel,
  notificationService = notifications
} = {}) => {
  if (!getInternalNotificationsEnabled()) return { disabled: true, reviewed: 0, created: 0 };

  const target = new Date(now.getTime() + REMINDER_MINUTES * 60_000);
  const dates = [...new Set([boliviaDate(now), boliviaDate(target)])];
  const appointments = await appointmentModel.findAll({
    attributes: ['id', 'fecha', 'hora_inicio', 'estado'],
    where: { fecha: { [Op.in]: dates }, estado: { [Op.in]: ELIGIBLE_STATES } },
    include: [{ model: patientModel, as: 'paciente', required: true, attributes: ['id', 'nombres', 'apellidos'] }]
  });
  const due = appointments.filter((item) => isDue(item, now));
  if (!due.length) return { reviewed: appointments.length, due: 0, created: 0 };

  const recipients = await activeUsers(['admin', 'personal'], userModel);
  let created = 0;
  for (const appointment of due) {
    if (typeof appointment.reload === 'function') {
      await appointment.reload({
        attributes: ['id', 'fecha', 'hora_inicio', 'estado'],
        include: [{ model: patientModel, as: 'paciente', required: true, attributes: ['id', 'nombres', 'apellidos'] }]
      });
    }
    if (!isDue(appointment, now)) continue;
    const name = patientName(appointment.paciente);
    const results = await notificationService.createForUsers({
      userIds: recipients,
      type: 'CITA_PROXIMA',
      title: 'Cita próxima',
      message: `La cita del paciente ${name} comienza en 5 minutos.`,
      entityType: 'CITA_AGENDA',
      entityId: appointment.id,
      priority: 'ALTA',
      idempotencyKey: (userId) => `appointment-five-minutes:${appointment.id}:${scheduleToken(appointment)}:${userId}`
    });
    created += results.filter((result) => result.created).length;
  }
  return { reviewed: appointments.length, due: due.length, created };
};

module.exports = { ELIGIBLE_STATES, REMINDER_MINUTES, appointmentInstant, scheduleToken, patientName, isDue, processInternalAppointmentReminders };
