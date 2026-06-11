const { InformeMedico, Paciente } = require('../models');

const includePaciente = [{ model: Paciente, as: 'paciente' }];

const validarInforme = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.fecha) return 'fecha es requerida';
  if (!body.diagnostico) return 'diagnostico es requerido';
  if (body.cantidad_sesiones !== undefined && body.cantidad_sesiones !== null && Number(body.cantidad_sesiones) < 0) {
    return 'cantidad_sesiones no puede ser negativa';
  }
  return null;
};

const normalizarInforme = (body) => ({
  paciente_id: body.paciente_id,
  fecha: body.fecha,
  doctor: body.doctor,
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

const listarInformes = async (req, res, next) => {
  try {
    const informes = await InformeMedico.findAll({ include: includePaciente, order: [['fecha', 'DESC'], ['id', 'DESC']] });
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

    const informe = await InformeMedico.create(normalizarInforme(req.body));
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

    const payload = normalizarInforme({ ...informe.toJSON(), ...req.body });
    const errorValidacion = validarInforme(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

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
