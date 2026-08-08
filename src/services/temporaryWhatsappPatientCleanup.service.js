const { Op } = require('sequelize');
const models = require('../models');
const { boliviaDate, boliviaTime } = require('../utils/boliviaDateTime');
const { markReferralNotificationsRead } = require('./internalNotification.service');

const ACTIVE_APPOINTMENT_STATES = models.BLOCKING_APPOINTMENT_STATUSES;
const ACTIVE_REFERRAL_STATES = ['PENDIENTE', 'EN_ATENCION'];
const AUTOMATIC_RESOLUTIONS = Object.freeze({
  'No asistio': 'Paciente temporal no asistió a la cita. Solicitud cerrada automáticamente.',
  Cancelada: 'Paciente temporal canceló su cita. Solicitud cerrada automáticamente.'
});

const retentionModels = [
  models.HistoriaClinica,
  models.InformeMedico,
  models.RegistroSemanal,
  models.PlanillaAtencion,
  models.PlanillaSesion,
  models.TareaPersonal,
  models.DocumentoClinico,
  models.PagoClinico,
  models.ConceptoCobro,
  models.ObservacionDiaria
];

const isAutomaticNoShowSession = (session, appointment) => (
  Number(appointment.sesion_id) === Number(session.id)
  && session.asistencia === 'no_asistio'
  && !session.historia_clinica_id
  && Number(session.sesiones_debe || 0) === 0
  && Number(session.sesiones_hizo || 0) === 0
  && Number(session.monto_sesion || 0) === 0
  && Number(session.monto_pagado || 0) === 0
  && Number(session.saldo_pendiente || 0) === 0
  && session.aplica_farmacos !== true
);

const futureAppointmentWhere = (appointment, today, currentTime) => ({
  paciente_id: appointment.paciente_id,
  id: { [Op.ne]: appointment.id },
  estado: { [Op.in]: ACTIVE_APPOINTMENT_STATES },
  [Op.or]: [
    { fecha: { [Op.gt]: today } },
    {
      fecha: today,
      [Op.or]: [
        { hora_fin: { [Op.gt]: currentTime } },
        { hora_fin: null, hora_inicio: { [Op.gt]: currentTime } }
      ]
    }
  ]
});

const cleanupTemporaryWhatsappNoShow = async (appointment, {
  transaction,
  patientModel = models.Paciente,
  appointmentModel = models.Cita,
  sessionModel = models.Sesion,
  referralModel = models.WhatsappReceptionReferral,
  syncNotifications = markReferralNotificationsRead,
  protectedModels = retentionModels,
  today = boliviaDate(),
  currentTime = boliviaTime(new Date(), false)
} = {}) => {
  if (!AUTOMATIC_RESOLUTIONS[appointment.estado] || appointment.origen !== 'WhatsApp') {
    return { temporary: false, archived: false, reason: 'NOT_ELIGIBLE_APPOINTMENT' };
  }

  const patient = await patientModel.findByPk(appointment.paciente_id, {
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  if (!patient || patient.registro_pendiente !== true) {
    return { temporary: false, archived: false, reason: 'NOT_TEMPORARY_PATIENT' };
  }

  const futureCount = await appointmentModel.count({
    where: futureAppointmentWhere(appointment, today, currentTime),
    transaction
  });
  if (futureCount > 0) return { temporary: true, archived: false, reason: 'FUTURE_APPOINTMENT' };

  for (const model of protectedModels) {
    if (await model.count({ where: { paciente_id: patient.id }, transaction }) > 0) {
      return { temporary: true, archived: false, reason: 'PROTECTED_RELATION' };
    }
  }

  const sessions = await sessionModel.findAll({
    where: { paciente_id: patient.id },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const automaticSessions = sessions.filter((session) => isAutomaticNoShowSession(session, appointment));
  if (automaticSessions.length !== sessions.length) {
    return { temporary: true, archived: false, reason: 'CLINICAL_SESSION' };
  }

  if (appointment.sesion_id && automaticSessions.length) {
    await appointment.update({ sesion_id: null }, { transaction });
    for (const session of automaticSessions) await session.destroy({ transaction });
  }

  const now = new Date();
  const referrals = await referralModel.findAll({
    where: {
      tipo_derivacion: 'REGISTRO_PACIENTE',
      estado: { [Op.in]: ACTIVE_REFERRAL_STATES },
      [Op.or]: [{ cita_id: appointment.id }, { paciente_id: patient.id }]
    },
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  for (const referral of referrals) {
    await referral.update({
      estado: 'CERRADA',
      resolucion: AUTOMATIC_RESOLUTIONS[appointment.estado],
      cerrada_en: now,
      historial: [
        ...(Array.isArray(referral.historial) ? referral.historial : []),
        { accion: 'CIERRE_AUTOMATICO', origen: 'SISTEMA', motivo: appointment.estado, fecha: now.toISOString() }
      ]
    }, { transaction });
    await syncNotifications({ referralId: referral.id, transaction, now });
  }

  // Soft-delete: preserves the appointment and WhatsApp audit without breaking RESTRICT FKs.
  await patient.update({ estado: false }, { transaction });
  return { temporary: true, archived: true, reason: 'ARCHIVED' };
};

module.exports = {
  ACTIVE_APPOINTMENT_STATES,
  ACTIVE_REFERRAL_STATES,
  AUTOMATIC_RESOLUTIONS,
  cleanupTemporaryWhatsappNoShow,
  futureAppointmentWhere,
  isAutomaticNoShowSession
};
