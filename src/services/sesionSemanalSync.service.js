const { Op } = require('sequelize');
const { HistoriaClinica, Paciente, RegistroSemanal, Sesion } = require('../models');
const { ensureRegistroSemanalSchema } = require('./registroSemanalSchema.service');

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const parseDateOnly = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

const normalizarSexoRegistro = (sexo) => {
  const value = String(sexo || '').toLocaleUpperCase('es-BO');
  if (value === 'MASCULINO' || value === 'M') return 'M';
  if (value === 'FEMENINO' || value === 'F') return 'F';
  return sexo ? 'Otro' : null;
};

const obtenerSemana = (fecha) => {
  const date = parseDateOnly(fecha);
  const day = date.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - daysFromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { inicio: formatDateOnly(start), fin: formatDateOnly(end) };
};

const construirResumen = (sesiones) => {
  const resumen = {};
  sesiones.forEach((sesion) => {
    const dayName = DAY_NAMES[parseDateOnly(sesion.fecha).getUTCDay()];
    if (!resumen[dayName]) resumen[dayName] = [];
    resumen[dayName].push({
      id: sesion.id,
      fecha: sesion.fecha,
      numero_sesion: sesion.numero_sesion,
      sesiones_debe: Number(sesion.sesiones_debe || 0),
      sesiones_hizo: Number(sesion.sesiones_hizo || 0),
      asistencia: sesion.asistencia,
      metodo_pago: sesion.metodo_pago,
      estado_pago: sesion.estado_pago,
      monto_sesion: Number(sesion.monto_sesion || 0),
      monto_pagado: Number(sesion.monto_pagado || 0),
      saldo_pendiente: Number(sesion.saldo_pendiente || 0),
      aplica_farmacos: Boolean(sesion.aplica_farmacos),
      observacion_farmacos: sesion.observacion_farmacos || null,
      observacion: sesion.observacion || null,
      medios_fisicos: sesion.medios_fisicos || null,
      tecnicas_manuales: sesion.tecnicas_manuales || null,
      descripcion_tratamiento: sesion.descripcion_tratamiento || null,
      evolucion_observada: sesion.evolucion_observada || null,
      dolor_antes: sesion.dolor_antes ?? null,
      dolor_despues: sesion.dolor_despues ?? null,
      inyectable_nombre: sesion.inyectable_nombre || null,
      inyectable_dosis: sesion.inyectable_dosis || null,
      profesional_responsable: sesion.profesional_responsable || sesion.registrado_por?.nombre || null,
      anulada: Boolean(sesion.anulada)
    });
  });
  return resumen;
};

const buscarDatosPaciente = async (pacienteId, historiaClinicaId, transaction) => {
  const paciente = await Paciente.findByPk(pacienteId, { transaction });
  const historia = historiaClinicaId
    ? await HistoriaClinica.findByPk(historiaClinicaId, { transaction })
    : await HistoriaClinica.findOne({
      where: { paciente_id: pacienteId },
      order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']],
      transaction
    });
  return { paciente, historia };
};

const agruparPorHistoria = (sesiones) => sesiones.reduce((groups, sesion) => {
  const key = sesion.historia_clinica_id || 'sin_historia';
  if (!groups[key]) groups[key] = [];
  groups[key].push(sesion);
  return groups;
}, {});

const resumenObservaciones = (sesiones) => {
  const observaciones = sesiones.map((sesion) => sesion.observacion).filter(Boolean);
  return observaciones.length ? observaciones.join(' ') : null;
};

const sincronizarSemana = async (pacienteId, fecha, transaction) => {
  if (!pacienteId || !fecha) return null;
  await ensureRegistroSemanalSchema(transaction);
  const semana = obtenerSemana(fecha);
  const sesiones = await Sesion.findAll({
    where: {
      paciente_id: pacienteId,
      fecha: { [Op.between]: [semana.inicio, semana.fin] },
      anulada: false
    },
    order: [['fecha', 'ASC'], ['id', 'ASC']],
    transaction
  });

  if (!sesiones.length) {
    await RegistroSemanal.destroy({
      where: {
        paciente_id: pacienteId,
        semana_inicio: semana.inicio,
        generado_automaticamente: true
      },
      transaction
    });
    return [];
  }

  const grupos = agruparPorHistoria(sesiones);
  const historiasActivas = Object.keys(grupos).map((key) => (key === 'sin_historia' ? null : Number(key)));
  const historiasActivasConId = historiasActivas.filter((id) => id !== null);
  const permiteHistoriaNula = historiasActivas.includes(null);
  const registros = [];

  const staleHistoriaWhere = historiasActivasConId.length
    ? {
      [Op.or]: [
        ...(!permiteHistoriaNula ? [{ historia_clinica_id: null }] : []),
        { historia_clinica_id: { [Op.notIn]: historiasActivasConId } }
      ]
    }
    : { historia_clinica_id: { [Op.ne]: null } };

  await RegistroSemanal.destroy({
    where: {
      paciente_id: pacienteId,
      semana_inicio: semana.inicio,
      generado_automaticamente: true,
      ...staleHistoriaWhere
    },
    transaction
  });

  for (const [historiaKey, sesionesHistoria] of Object.entries(grupos)) {
    const historiaClinicaId = historiaKey === 'sin_historia' ? null : Number(historiaKey);
    let registro = await RegistroSemanal.findOne({
      where: {
        paciente_id: pacienteId,
        semana_inicio: semana.inicio,
        historia_clinica_id: historiaClinicaId
      },
      order: [['id', 'ASC']],
      transaction
    });

    const { paciente, historia } = await buscarDatosPaciente(pacienteId, historiaClinicaId, transaction);

    if (!registro) {
      registro = await RegistroSemanal.create({
        paciente_id: pacienteId,
        historia_clinica_id: historiaClinicaId,
        semana_inicio: semana.inicio,
        semana_fin: semana.fin,
        generado_automaticamente: true
      }, { transaction });
    }

    const deudaSemana = sesionesHistoria.reduce((sum, sesion) => sum + Number(sesion.saldo_pendiente || 0), 0);
    await registro.update({
      historia_clinica_id: historiaClinicaId,
      semana_fin: semana.fin,
      diagnostico: historia?.diagnostico_medico || historia?.motivo_consulta || null,
      telefono: paciente?.telefono || null,
      edad: paciente?.edad ?? null,
      sexo: normalizarSexoRegistro(paciente?.sexo),
      sesiones_resumen: construirResumen(sesionesHistoria),
      total_sesiones: sesionesHistoria.length,
      sincronizado_sesiones: true,
      aplica_farmacos: sesionesHistoria.some((sesion) => Boolean(sesion.aplica_farmacos)),
      debe_bs: deudaSemana,
      observacion: resumenObservaciones(sesionesHistoria)
    }, { transaction });

    registros.push(registro);
  }

  return registros;
};

module.exports = {
  construirResumen,
  obtenerSemana,
  sincronizarSemana
};
