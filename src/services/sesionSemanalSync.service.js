const { Op } = require('sequelize');
const { HistoriaClinica, Paciente, RegistroSemanal, Sesion } = require('../models');

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const parseDateOnly = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

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
      asistencia: sesion.asistencia,
      metodo_pago: sesion.metodo_pago,
      estado_pago: sesion.estado_pago,
      aplica_farmacos: Boolean(sesion.aplica_farmacos),
      observacion_farmacos: sesion.observacion_farmacos || null,
      observacion: sesion.observacion || null
    });
  });
  return resumen;
};

const buscarDatosPaciente = async (pacienteId, transaction) => {
  const paciente = await Paciente.findByPk(pacienteId, { transaction });
  const historia = await HistoriaClinica.findOne({
    where: { paciente_id: pacienteId },
    order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']],
    transaction
  });
  return { paciente, historia };
};

const sincronizarSemana = async (pacienteId, fecha, transaction) => {
  if (!pacienteId || !fecha) return null;
  const semana = obtenerSemana(fecha);
  const sesiones = await Sesion.findAll({
    where: {
      paciente_id: pacienteId,
      fecha: { [Op.between]: [semana.inicio, semana.fin] }
    },
    order: [['fecha', 'ASC'], ['id', 'ASC']],
    transaction
  });

  let registro = await RegistroSemanal.findOne({
    where: { paciente_id: pacienteId, semana_inicio: semana.inicio },
    order: [['id', 'ASC']],
    transaction
  });

  if (!sesiones.length) {
    if (registro?.generado_automaticamente) {
      await registro.destroy({ transaction });
      return null;
    }
    if (registro) {
      await registro.update({
        sesiones_resumen: {},
        total_sesiones: 0,
        sincronizado_sesiones: false,
        aplica_farmacos: false
      }, { transaction });
    }
    return registro;
  }

  if (!registro) {
    const { paciente, historia } = await buscarDatosPaciente(pacienteId, transaction);
    registro = await RegistroSemanal.create({
      paciente_id: pacienteId,
      semana_inicio: semana.inicio,
      semana_fin: semana.fin,
      diagnostico: historia?.diagnostico_medico || null,
      telefono: paciente?.telefono || null,
      edad: paciente?.edad ?? null,
      sexo: paciente?.sexo || null,
      generado_automaticamente: true
    }, { transaction });
  }

  await registro.update({
    semana_fin: semana.fin,
    sesiones_resumen: construirResumen(sesiones),
    total_sesiones: sesiones.length,
    sincronizado_sesiones: true,
    aplica_farmacos: sesiones.some((sesion) => Boolean(sesion.aplica_farmacos))
  }, { transaction });

  return registro;
};

module.exports = {
  obtenerSemana,
  sincronizarSemana
};
