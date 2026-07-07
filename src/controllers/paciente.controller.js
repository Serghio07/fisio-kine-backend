const { Op } = require('sequelize');
const { Paciente } = require('../models');
const { validarImagen } = require('../utils/imagen');

const camposPaciente = [
  'nombres', 'apellidos', 'ci', 'fecha_nacimiento', 'lugar_nacimiento',
  'sexo', 'telefono', 'foto', 'peso', 'talla', 'domicilio',
  'estado_civil', 'ocupacion', 'referencia'
];
const camposMayuscula = [
  'nombres', 'apellidos', 'lugar_nacimiento', 'estado_civil',
  'ocupacion', 'domicilio', 'referencia'
];

const textoLimpio = (value, mayuscula = false) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const limpio = String(value).trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return mayuscula ? limpio.toLocaleUpperCase('es-BO') : limpio;
};

const calcularEdad = (fecha) => {
  if (!fecha) return null;
  const nacimiento = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
};

const normalizarPaciente = (body) => {
  const data = camposPaciente.reduce((result, campo) => {
    if (!Object.prototype.hasOwnProperty.call(body, campo)) return result;
    result[campo] = body[campo];
    return result;
  }, {});

  camposMayuscula.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) {
      data[campo] = textoLimpio(data[campo], true);
    }
  });
  ['ci', 'telefono'].forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) data[campo] = textoLimpio(data[campo]);
  });

  if (Object.prototype.hasOwnProperty.call(data, 'sexo')) {
    const sexo = textoLimpio(data.sexo, true);
    data.sexo = sexo === 'M' ? 'MASCULINO' : sexo === 'F' ? 'FEMENINO' : sexo;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'fecha_nacimiento')) {
    data.fecha_nacimiento = data.fecha_nacimiento || null;
    data.edad = calcularEdad(data.fecha_nacimiento);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'peso')) data.peso = data.peso === '' || data.peso === null ? null : Number(data.peso);
  if (Object.prototype.hasOwnProperty.call(data, 'talla')) data.talla = data.talla === '' || data.talla === null ? null : Number(data.talla);
  if (Object.prototype.hasOwnProperty.call(data, 'peso') || Object.prototype.hasOwnProperty.call(data, 'talla')) {
    const peso = Number(data.peso);
    const talla = Number(data.talla);
    data.imc = peso > 0 && talla > 0 ? Number((peso / (talla ** 2)).toFixed(2)) : null;
  }
  return data;
};

const validarPaciente = (data) => {
  if (!data.nombres) return 'Los nombres son obligatorios.';
  if (!data.apellidos) return 'Los apellidos son obligatorios.';
  if (!data.ci) return 'El CI es obligatorio.';
  if (!data.telefono) return 'El teléfono es obligatorio.';
  if (!data.sexo) return 'El sexo es obligatorio.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.nombres)) return 'Los nombres no pueden contener números.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.apellidos)) return 'Los apellidos no pueden contener números.';
  if (!/^\d+$/.test(data.ci)) return 'El CI solo puede contener números.';
  if (!/^\d{7,8}$/.test(data.telefono)) return 'El teléfono debe tener 7 u 8 dígitos.';
  if (!['MASCULINO', 'FEMENINO'].includes(data.sexo)) return 'Selecciona MASCULINO o FEMENINO.';
  if (data.fecha_nacimiento && new Date(`${data.fecha_nacimiento}T00:00:00`) > new Date()) return 'La fecha de nacimiento no puede ser futura.';
  if (data.peso !== null && data.peso !== undefined && (!Number.isFinite(data.peso) || data.peso <= 0)) return 'El peso debe ser mayor que cero.';
  if (data.talla !== null && data.talla !== undefined && (!Number.isFinite(data.talla) || data.talla <= 0)) return 'La talla debe ser mayor que cero.';
  return null;
};

const validarCiUnico = async (ci, id = null) => {
  const where = { ci };
  if (id) where.id = { [Op.ne]: id };
  return !(await Paciente.findOne({ where, attributes: ['id'] }));
};

const listarPacientes = async (req, res, next) => {
  try {
    const pacientes = await Paciente.findAll({ order: [['id', 'DESC']], limit: 500 });
    return res.json(pacientes);
  } catch (error) {
    return next(error);
  }
};

const obtenerPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    return res.json(paciente);
  } catch (error) {
    return next(error);
  }
};

const crearPaciente = async (req, res, next) => {
  try {
    const data = normalizarPaciente(req.body);
    const errorValidacion = validarPaciente(data);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarCiUnico(data.ci))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese CI.' });
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    const paciente = await Paciente.create({ ...data, estado: true });
    return res.status(201).json(paciente);
  } catch (error) {
    return next(error);
  }
};

const actualizarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const data = normalizarPaciente(req.body);
    const completo = { ...paciente.toJSON(), ...data };
    const errorValidacion = validarPaciente(completo);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarCiUnico(completo.ci, paciente.id))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese CI.' });
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    await paciente.update(data);
    return res.json(paciente);
  } catch (error) {
    return next(error);
  }
};

const eliminarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    if (!paciente.estado) return res.json({ message: 'El paciente ya estaba inactivo.', paciente });
    await paciente.update({ estado: false });
    return res.json({ message: 'Paciente desactivado correctamente.', paciente });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarPacientes,
  obtenerPaciente,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente
};
