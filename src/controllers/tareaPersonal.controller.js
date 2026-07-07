const { Paciente, Personal, TareaPersonal, Usuario } = require('../models');

const include = [
  { model: Personal, as: 'personal', attributes: ['id', 'nombres', 'apellido_paterno', 'apellido_materno', 'cargo'] },
  { model: Usuario, as: 'asignado_a', attributes: ['id', 'nombre', 'usuario', 'estado'] },
  { model: Paciente, as: 'paciente', attributes: ['id', 'nombres', 'apellidos', 'ci'] },
  {
    model: Usuario,
    as: 'creado_por',
    attributes: ['id', 'nombre', 'usuario'],
    include: [{ model: Personal, as: 'ficha_personal' }]
  }
];
const estados = ['pendiente', 'en_progreso', 'completada', 'cancelada'];
const prioridades = ['baja', 'media', 'alta'];

const payload = (body) => ({
  personal_id: body.personal_id || null,
  asignado_usuario_id: null,
  paciente_id: body.paciente_id,
  titulo: String(body.titulo || '').trim(),
  descripcion: String(body.descripcion || '').trim() || null,
  fecha: body.fecha,
  hora: body.hora || null,
  prioridad: body.prioridad || 'media',
  estado: body.estado || 'pendiente'
});

const validar = (data) => {
  if (!data.paciente_id || !data.titulo || !data.fecha) return 'Paciente, titulo y fecha son obligatorios.';
  if (!estados.includes(data.estado)) return 'Estado no valido.';
  if (!prioridades.includes(data.prioridad)) return 'Prioridad no valida.';
  return null;
};

const listar = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.fecha) where.fecha = req.query.fecha;
    if (req.query.estado) where.estado = req.query.estado;
    const tareas = await TareaPersonal.findAll({ where, include, order: [['fecha', 'DESC'], ['hora', 'ASC'], ['id', 'DESC']] });
    return res.json(tareas);
  } catch (error) { return next(error); }
};

const crear = async (req, res, next) => {
  try {
    const data = payload(req.body);
    const error = validar(data);
    if (error) return res.status(400).json({ message: error });
    if (!await Paciente.findByPk(data.paciente_id)) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const ficha = await Personal.findOne({ where: { usuario_id: req.usuario.id } });
    data.personal_id = ficha?.id || null;
    const tarea = await TareaPersonal.create({ ...data, usuario_id: req.usuario.id });
    return res.status(201).json(await TareaPersonal.findByPk(tarea.id, { include }));
  } catch (error) { return next(error); }
};

const actualizar = async (req, res, next) => {
  try {
    const tarea = await TareaPersonal.findByPk(req.params.id);
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada.' });
    if (req.usuario.rol !== 'admin' && String(tarea.usuario_id) !== String(req.usuario.id)) {
      return res.status(403).json({ message: 'Solo puedes editar tus propias tareas.' });
    }
    const data = payload({ ...tarea.toJSON(), ...req.body });
    const error = validar(data);
    if (error) return res.status(400).json({ message: error });
    if (!await Paciente.findByPk(data.paciente_id)) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const ficha = await Personal.findOne({ where: { usuario_id: tarea.usuario_id } });
    data.personal_id = ficha?.id || null;
    await tarea.update(data);
    return res.json(await TareaPersonal.findByPk(tarea.id, { include }));
  } catch (error) { return next(error); }
};

const cambiarEstado = async (req, res, next) => {
  try {
    if (!estados.includes(req.body.estado)) return res.status(400).json({ message: 'Estado no valido.' });
    const tarea = await TareaPersonal.findByPk(req.params.id);
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada.' });
    if (req.usuario.rol !== 'admin' && String(tarea.usuario_id) !== String(req.usuario.id)) {
      return res.status(403).json({ message: 'Solo puedes cambiar tus propias tareas.' });
    }
    await tarea.update({ estado: req.body.estado });
    return res.json(await TareaPersonal.findByPk(tarea.id, { include }));
  } catch (error) { return next(error); }
};

const eliminar = async (req, res, next) => {
  try {
    const tarea = await TareaPersonal.findByPk(req.params.id);
    if (!tarea) return res.status(404).json({ message: 'Tarea no encontrada.' });
    if (req.usuario.rol !== 'admin' && String(tarea.usuario_id) !== String(req.usuario.id)) {
      return res.status(403).json({ message: 'Solo puedes eliminar tus propias tareas.' });
    }
    await tarea.destroy();
    return res.json({ message: 'Tarea eliminada correctamente.' });
  } catch (error) { return next(error); }
};

module.exports = { listar, crear, actualizar, cambiarEstado, eliminar };
