const { Op } = require('sequelize');
const { Cita, EvaluacionFinal, Sesion } = require('../models');
const { sincronizarSemana } = require('./sesionSemanalSync.service');

const synchronizeTreatmentTotal = async ({ historyId, total, transaction, changedBy = 'Sistema' }) => {
  const nextTotal = Number(total);
  if (!Number.isInteger(nextTotal) || nextTotal <= 0) throw Object.assign(new Error('El total de sesiones debe ser mayor que cero'), { status: 400 });

  const sessions = await Sesion.findAll({
    where: { historia_clinica_id: historyId, anulada: false },
    attributes: ['id', 'paciente_id', 'fecha', 'numero_sesion', 'asistencia', 'monto_pagado', 'saldo_pendiente'],
    transaction,
    lock: transaction?.LOCK?.UPDATE
  });
  const excessSessions = sessions.filter((item) => Number(item.numero_sesion) > nextTotal);
  const protectedSession = excessSessions.find((item) => item.asistencia === 'asistio' || Number(item.monto_pagado || 0) > 0 || Number(item.saldo_pendiente || 0) > 0);
  if (protectedSession) throw Object.assign(new Error(`No se puede reducir a ${nextTotal}: la sesión ${protectedSession.numero_sesion} tiene atención o información financiera registrada.`), { status: 409 });

  const excessAppointments = await Cita.findAll({ where: { historia_clinica_id: historyId, origen: 'Plan de tratamiento', numero_sesion: { [Op.gt]: nextTotal }, estado: { [Op.notIn]: ['Cancelada', 'Reprogramada'] } }, attributes: ['id'], transaction, lock: transaction?.LOCK?.UPDATE });
  const planAppointments = await Cita.findAll({ where: { historia_clinica_id: historyId, origen: 'Plan de tratamiento' }, attributes: ['id', 'numero_sesion', 'motivo'], transaction, lock: transaction?.LOCK?.UPDATE });
  await EvaluacionFinal.update({ sesiones_contratadas: nextTotal }, { where: { historia_clinica_id: historyId }, transaction });
  await Cita.update({ total_sesiones: nextTotal }, { where: { historia_clinica_id: historyId, origen: 'Plan de tratamiento' }, transaction });
  for (const appointment of planAppointments) {
    if (/^sesi[oó]n\s+\d+\s+de\s+\d+$/i.test(String(appointment.motivo || '').trim())) {
      await appointment.update({ motivo: `Sesion ${appointment.numero_sesion} de ${nextTotal}` }, { transaction });
    }
  }
  await Cita.update({ estado: 'Cancelada' }, { where: { historia_clinica_id: historyId, origen: 'Plan de tratamiento', numero_sesion: { [Op.gt]: nextTotal }, estado: { [Op.notIn]: ['Cancelada', 'Reprogramada'] } }, transaction });
  await Sesion.update({ sesiones_debe: nextTotal }, { where: { historia_clinica_id: historyId, anulada: false }, transaction });
  if (excessSessions.length) await Sesion.update({ anulada: true, anulada_en: new Date(), anulada_por: changedBy, motivo_anulacion: 'Ajuste del plan de tratamiento', observacion_anulacion: `El total de sesiones indicadas se redujo a ${nextTotal}.` }, { where: { id: { [Op.in]: excessSessions.map((item) => item.id) }, anulada: false }, transaction });

  const weeks = new Set();
  for (const session of sessions) {
    const key = `${session.paciente_id}:${session.fecha}`;
    if (weeks.has(key)) continue;
    weeks.add(key);
    await sincronizarSemana(session.paciente_id, session.fecha, transaction);
  }
  return { total: nextTotal, canceledAppointmentIds: excessAppointments.map((item) => Number(item.id)) };
};

module.exports = { synchronizeTreatmentTotal };
