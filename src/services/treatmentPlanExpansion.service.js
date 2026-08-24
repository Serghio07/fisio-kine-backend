const { sequelize, HistoriaClinica, EvaluacionFinal, HistorialAmpliacionSesiones, Sesion, Usuario, Personal } = require('../models');
const { synchronizeTreatmentTotal } = require('./treatmentPlan.service');

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });

const expansionInclude = [{
  model: Usuario,
  as: 'creado_por',
  attributes: ['id', 'nombre', 'usuario'],
  include: [{ model: Personal, as: 'ficha_personal', attributes: ['nombre_mostrado'], required: false }]
}];

const buildSummary = async (historyId, total, transaction) => {
  const realizadas = await Sesion.count({
    where: { historia_clinica_id: historyId, anulada: false, asistencia: 'asistio' },
    transaction
  });
  return { total_planificado: total, sesiones_realizadas: realizadas, sesiones_restantes: Math.max(total - realizadas, 0) };
};

const expandTreatmentPlan = async ({ historyId, increment, reason, userId, requestId }) => {
  const incremento = Number(increment);
  const motivoIngresado = typeof reason === 'string' ? reason.trim().replace(/\s+/g, ' ') : '';
  const motivo = motivoIngresado || 'SIN MOTIVO ESPECIFICADO';
  if (!Number.isInteger(incremento) || incremento <= 0) throw badRequest('El incremento debe ser un numero entero mayor que cero.');
  if (motivo.length > 500) throw badRequest('El motivo no puede superar 500 caracteres.');
  if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw badRequest('Idempotency-Key es obligatorio y debe ser un UUID valido.');
  }

  return sequelize.transaction(async (transaction) => {
    const historia = await HistoriaClinica.findByPk(historyId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!historia || historia.anulada || historia.estado === 'anulada') throw badRequest('Historia clinica activa no encontrada.', 404);
    const evaluacion = await EvaluacionFinal.findOne({ where: { historia_clinica_id: historia.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!evaluacion) throw badRequest('La historia no tiene un plan de tratamiento registrado.', 409);

    const repetida = await HistorialAmpliacionSesiones.findOne({ where: { solicitud_id: requestId }, include: expansionInclude, transaction });
    if (repetida) {
      if (Number(repetida.historia_clinica_id) !== Number(historia.id)) throw badRequest('La clave de idempotencia ya fue utilizada.', 409);
      return { ampliacion: repetida, resumen: await buildSummary(historia.id, repetida.total_nuevo, transaction), idempotente: true };
    }

    const totalAnterior = Number(evaluacion.sesiones_contratadas);
    if (!Number.isInteger(totalAnterior) || totalAnterior <= 0) throw badRequest('El total actual del plan es invalido.', 409);
    const totalNuevo = totalAnterior + incremento;
    const ampliacion = await HistorialAmpliacionSesiones.create({
      evaluacion_final_id: evaluacion.id,
      historia_clinica_id: historia.id,
      total_anterior: totalAnterior,
      incremento,
      total_nuevo: totalNuevo,
      motivo,
      creado_por_id: userId,
      solicitud_id: requestId
    }, { transaction });

    await synchronizeTreatmentTotal({ historyId: historia.id, total: totalNuevo, transaction });
    await ampliacion.reload({ include: expansionInclude, transaction });
    return { ampliacion, resumen: await buildSummary(historia.id, totalNuevo, transaction), idempotente: false };
  });
};

const listTreatmentPlanExpansions = async (historyId) => HistorialAmpliacionSesiones.findAll({
  where: { historia_clinica_id: historyId },
  include: expansionInclude,
  order: [['created_at', 'DESC'], ['id', 'DESC']]
});

module.exports = { expandTreatmentPlan, listTreatmentPlanExpansions };
