const { HistoriaClinica, InformeMedico, Paciente } = require('../models');

const includePaciente = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica' }
];
const nombreUsuarioAutenticado = (req) =>
  req.usuario?.ficha_personal?.nombre_mostrado || req.usuario?.nombre || '';

const validarInforme = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.historia_clinica_id) return 'historia_clinica_id es requerido';
  if (!body.fecha) return 'fecha es requerida';
  if (!body.diagnostico) return 'diagnostico es requerido';
  if (body.cantidad_sesiones !== undefined && body.cantidad_sesiones !== null && Number(body.cantidad_sesiones) < 0) {
    return 'cantidad_sesiones no puede ser negativa';
  }
  return null;
};

const normalizarInforme = (body, doctor) => ({
  paciente_id: body.paciente_id,
  historia_clinica_id: body.historia_clinica_id,
  fecha: body.fecha,
  doctor,
  diagnostico: body.diagnostico,
  dx_cie: body.dx_cie,
  antecedentes: body.antecedentes,
  conclusion_diagnostica: body.conclusion_diagnostica,
  cantidad_sesiones: body.cantidad_sesiones === '' || body.cantidad_sesiones === null ? null : Number(body.cantidad_sesiones || 0),
  tratamiento_fisioterapeutico: body.tratamiento_fisioterapeutico,
  medicamentos: body.medicamentos,
  estado_actual: body.estado_actual,
  observacion_final: body.observacion_final
});

const validarHistoriaActiva = async (pacienteId, historiaClinicaId) => {
  const historia = await HistoriaClinica.findByPk(historiaClinicaId);
  if (!historia) return 'Historia clinica no encontrada';
  if (Number(historia.paciente_id) !== Number(pacienteId)) return 'La historia clinica no pertenece al paciente seleccionado';
  if (historia.anulada || historia.estado === 'anulada') return 'No se puede generar informe de una historia clinica anulada';
  if ((historia.estado || 'activa') !== 'activa') return 'Selecciona una historia clinica activa';
  return null;
};

const listarInformes = async (req, res, next) => {
  try {
    const informes = await InformeMedico.findAll({
      include: includePaciente,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 500
    });
    return res.json(informes);
  } catch (error) {
    return next(error);
  }
};

const obtenerInforme = async (req, res, next) => {
  try {
    const informe = await InformeMedico.findByPk(req.params.id, { include: includePaciente });
    if (!informe) return res.status(404).json({ message: 'Informe medico no encontrado' });
    return res.json(informe);
  } catch (error) {
    return next(error);
  }
};

const crearInforme = async (req, res, next) => {
  try {
    const errorValidacion = validarInforme(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const errorHistoria = await validarHistoriaActiva(req.body.paciente_id, req.body.historia_clinica_id);
    if (errorHistoria) return res.status(400).json({ message: errorHistoria });

    const informe = await InformeMedico.create(normalizarInforme(req.body, nombreUsuarioAutenticado(req)));
    const informeCompleto = await InformeMedico.findByPk(informe.id, { include: includePaciente });
    return res.status(201).json(informeCompleto);
  } catch (error) {
    return next(error);
  }
};

const actualizarInforme = async (req, res, next) => {
  try {
    const informe = await InformeMedico.findByPk(req.params.id);
    if (!informe) return res.status(404).json({ message: 'Informe medico no encontrado' });

    const payload = normalizarInforme(
      { ...informe.toJSON(), ...req.body },
      nombreUsuarioAutenticado(req)
    );
    const errorValidacion = validarInforme(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const errorHistoria = await validarHistoriaActiva(payload.paciente_id, payload.historia_clinica_id);
    if (errorHistoria) return res.status(400).json({ message: errorHistoria });

    await informe.update(payload);
    const informeCompleto = await InformeMedico.findByPk(informe.id, { include: includePaciente });
    return res.json(informeCompleto);
  } catch (error) {
    return next(error);
  }
};

const eliminarInforme = async (req, res, next) => {
  try {
    const informe = await InformeMedico.findByPk(req.params.id);
    if (!informe) return res.status(404).json({ message: 'Informe medico no encontrado' });

    await informe.destroy();
    return res.json({ message: 'Informe medico eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarInformes,
  obtenerInforme,
  crearInforme,
  actualizarInforme,
  eliminarInforme
};
