const {
  Paciente, HistoriaClinica, CondicionActual, IntervencionClinica, EvaluacionFinal,
  Sesion, Cita, ConceptoCobro, MovimientoPago, Usuario, DocumentoClinico,
  InformeMedico, PlanillaAtencion, ActividadSistema
} = require('../models');
const { boliviaDateTime } = require('../utils/boliviaDateTime');

const registrarAuditoria = (req, pacienteId, accion, detalle) => {
  if (!req.usuario?.id) return Promise.resolve();
  const { fecha, hora } = boliviaDateTime();
  return ActividadSistema.create({
    usuario_id: req.usuario.id, paciente_id: pacienteId, entidad_id: pacienteId,
    fecha, hora, modulo: 'Resumen de pacientes', accion, detalle,
    datos: { paciente_id: pacienteId }, metodo: req.method, ruta: req.originalUrl.split('?')[0]
  });
};

const consolidarSesionesReales = (sesiones, conceptos) => {
  const vinculadasAPago = new Set(conceptos.map((item) => String(item.sesion_id || '')).filter(Boolean));
  const groups = new Map();
  sesiones.forEach((model) => {
    const item = model.toJSON();
    const key = [item.paciente_id, item.historia_clinica_id || 'sin-historia', item.fecha, item.numero_sesion].join('|');
    const score = (vinculadasAPago.has(String(item.id)) ? 100 : 0)
      + (item.asistencia === 'asistio' ? 30 : item.asistencia === 'no_asistio' ? 20 : 0)
      + (item.descripcion_tratamiento || item.evolucion_observada || item.observacion ? 10 : 0)
      + (Number(item.monto_pagado || 0) > 0 ? 5 : 0)
      + Number(item.id || 0) / 100000;
    const current = groups.get(key);
    if (!current || score > current.score) groups.set(key, { item, score });
  });
  return [...groups.values()].map(({ item }) => item)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || Number(b.numero_sesion) - Number(a.numero_sesion));
};

const resumenPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'El paciente solicitado no está disponible.' });

    const pacienteId = paciente.id;
    const [historias, sesiones, citas, conceptos, documentos, informes, planillas] = await Promise.all([
      HistoriaClinica.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: CondicionActual, as: 'condicion_actual' },
          { model: IntervencionClinica, as: 'intervencion_clinica' },
          { model: EvaluacionFinal, as: 'evaluacion_final' },
          { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'usuario', 'foto'] }
        ],
        order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
      }),
      Sesion.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico', 'motivo_consulta', 'estado', 'anulada'] },
          { model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre', 'usuario', 'foto'] }
        ],
        order: [['fecha', 'DESC'], ['numero_sesion', 'DESC']]
      }),
      Cita.findAll({
        where: { paciente_id: pacienteId },
        include: [{ model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre', 'usuario', 'foto'] }],
        order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']]
      }),
      ConceptoCobro.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'motivo_consulta', 'estado'] },
          { model: Sesion, as: 'sesion', attributes: ['id', 'fecha', 'numero_sesion'] },
          {
            model: MovimientoPago, as: 'movimientos', required: false,
            include: [{ model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre', 'usuario', 'foto'] }]
          }
        ],
        order: [['fecha_origen', 'DESC'], ['id', 'DESC']]
      }),
      DocumentoClinico.findAll({
        where: { paciente_id: pacienteId },
        include: [{ model: Usuario, as: 'creado_por', attributes: ['id', 'nombre', 'usuario', 'foto'] }],
        order: [['fecha', 'DESC'], ['id', 'DESC']]
      }),
      InformeMedico.findAll({
        where: { paciente_id: pacienteId },
        include: [{ model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'motivo_consulta', 'estado'] }],
        order: [['fecha', 'DESC'], ['id', 'DESC']]
      }),
      PlanillaAtencion.findAll({
        where: { paciente_id: pacienteId },
        include: [{ model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'motivo_consulta', 'estado'] }],
        order: [['fecha_inicio', 'DESC'], ['id', 'DESC']]
      })
    ]);

    const sesionesReales = consolidarSesionesReales(sesiones, conceptos);
    await registrarAuditoria(req, pacienteId, 'Consultó', `Consultó el resumen clínico y económico del paciente ${paciente.nombres} ${paciente.apellidos || ''}`.trim());
    return res.json({
      paciente,
      historias,
      sesiones: sesionesReales,
      citas,
      conceptos,
      documentos,
      informes,
      planillas,
      consultado_en: new Date().toISOString()
    });
  } catch (error) {
    return next(error);
  }
};

const auditarResumenPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id, { attributes: ['id', 'nombres', 'apellidos'] });
    if (!paciente) return res.status(404).json({ message: 'El paciente solicitado no está disponible.' });
    const tipo = ['Excel', 'PDF', 'Impresión'].includes(req.body.tipo) ? req.body.tipo : 'Exportación';
    await registrarAuditoria(req, paciente.id, 'Exportó', `Generó ${tipo} del resumen de ${paciente.nombres} ${paciente.apellidos || ''}`.trim());
    return res.json({ message: 'Exportación registrada en auditoría.' });
  } catch (error) {
    return next(error);
  }
};

module.exports = { resumenPaciente, auditarResumenPaciente };
