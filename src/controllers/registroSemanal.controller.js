const { Paciente, RegistroSemanal } = require('../models');

const includePaciente = [{ model: Paciente, as: 'paciente' }];

const validar = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.semana_inicio) return 'semana_inicio es requerida';
  if (!body.semana_fin) return 'semana_fin es requerida';
  if (body.debe_bs !== undefined && Number(body.debe_bs || 0) < 0) return 'debe_bs no puede ser negativo';
  return null;
};

const normalizar = (body) => ({
  semana_inicio: body.semana_inicio,
  semana_fin: body.semana_fin,
  paciente_id: body.paciente_id,
  diagnostico: body.diagnostico,
  telefono: body.telefono,
  edad: body.edad === '' || body.edad === null ? null : Number(body.edad || 0),
  sexo: body.sexo || null,
  lunes: body.lunes,
  martes: body.martes,
  miercoles: body.miercoles,
  jueves: body.jueves,
  viernes: body.viernes,
  sabado: body.sabado,
  debe_bs: body.debe_bs === '' || body.debe_bs === null ? 0 : Number(body.debe_bs || 0),
  observacion: body.observacion
});

const listarRegistros = async (req, res, next) => {
  try {
    const registros = await RegistroSemanal.findAll({ include: includePaciente, order: [['semana_inicio', 'DESC'], ['id', 'DESC']] });
    return res.json(registros);
  } catch (error) {
    return next(error);
  }
};

const obtenerRegistro = async (req, res, next) => {
  try {
    const registro = await RegistroSemanal.findByPk(req.params.id, { include: includePaciente });
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });
    return res.json(registro);
  } catch (error) {
    return next(error);
  }
};

const crearRegistro = async (req, res, next) => {
  try {
    const errorValidacion = validar(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const existente = await RegistroSemanal.findOne({
      where: {
        paciente_id: req.body.paciente_id,
        semana_inicio: req.body.semana_inicio
      },
      order: [['id', 'ASC']]
    });

    if (existente) {
      await existente.update({
        ...normalizar(req.body),
        aplica_farmacos: existente.aplica_farmacos,
        generado_automaticamente: false
      });
      const completoExistente = await RegistroSemanal.findByPk(existente.id, { include: includePaciente });
      return res.json(completoExistente);
    }

    const registro = await RegistroSemanal.create({
      ...normalizar(req.body),
      aplica_farmacos: false,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includePaciente });
    return res.status(201).json(completo);
  } catch (error) {
    return next(error);
  }
};

const actualizarRegistro = async (req, res, next) => {
  try {
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    const payload = normalizar({ ...registro.toJSON(), ...req.body });
    const errorValidacion = validar(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    await registro.update({
      ...payload,
      aplica_farmacos: registro.aplica_farmacos,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includePaciente });
    return res.json(completo);
  } catch (error) {
    return next(error);
  }
};

const eliminarRegistro = async (req, res, next) => {
  try {
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    await registro.destroy();
    return res.json({ message: 'Registro semanal eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarRegistros,
  obtenerRegistro,
  crearRegistro,
  actualizarRegistro,
  eliminarRegistro
};
