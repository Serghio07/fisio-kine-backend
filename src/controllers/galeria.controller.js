const fs = require('fs');
const path = require('path');
const sanitizeHtml = require('sanitize-html');
const { GaleriaImagen, Usuario } = require('../models');

const includeUsers = [
  { model: Usuario, as: 'creado_por', attributes: ['id', 'nombre', 'usuario'] },
  { model: Usuario, as: 'modificado_por', attributes: ['id', 'nombre', 'usuario'] }
];
const clean = (value, max) => sanitizeHtml(String(value || ''), { allowedTags: [], allowedAttributes: {} }).trim().slice(0, max);
const removeFile = (url) => {
  if (!url?.startsWith('/uploads/galeria/')) return;
  const base = path.resolve(__dirname, '../../uploads/galeria');
  const target = path.resolve(base, path.basename(url));
  try {
    if (target.startsWith(`${base}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
  } catch (error) {
    console.error('[Galería] No se pudo eliminar el archivo:', error.message);
  }
};
const validImageContent = (file) => {
  if (!file) return false;
  const bytes = fs.readFileSync(file.path).subarray(0, 12);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  return jpeg || png || webp;
};
const payloadFrom = (body, userId) => ({
  titulo: clean(body.titulo, 180),
  descripcion: clean(body.descripcion, 2000) || null,
  categoria: clean(body.categoria, 40),
  orden: Number.parseInt(body.orden, 10) || 0,
  estado: body.estado === 'PUBLICADO' ? 'PUBLICADO' : 'NO_PUBLICADO',
  modificadoPorId: userId
});
const validate = (payload) => {
  if (!payload.titulo) return 'El título es obligatorio.';
  if (!GaleriaImagen.CATEGORIAS.includes(payload.categoria)) return 'La categoría no es válida.';
  if (payload.orden < 0) return 'El orden no puede ser negativo.';
  return null;
};
const rejectBadFile = (req, res) => {
  if (!req.file || validImageContent(req.file)) return false;
  removeFile(`/uploads/galeria/${req.file.filename}`);
  res.status(400).json({ message: 'El contenido del archivo no corresponde a una imagen JPG, PNG o WebP válida.' });
  return true;
};

exports.listAdmin = async (_req, res, next) => {
  try { return res.json(await GaleriaImagen.findAll({ include: includeUsers, order: [['orden', 'ASC'], ['id', 'ASC']] })); }
  catch (error) { return next(error); }
};
exports.getAdmin = async (req, res, next) => {
  try {
    const item = await GaleriaImagen.findByPk(req.params.id, { include: includeUsers });
    return item ? res.json(item) : res.status(404).json({ message: 'Imagen de Galería no encontrada.' });
  } catch (error) { return next(error); }
};
exports.create = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'La fotografía es obligatoria.' });
    if (rejectBadFile(req, res)) return undefined;
    const payload = { ...payloadFrom(req.body, req.user.id), creadoPorId: req.user.id, imagen: `/uploads/galeria/${req.file.filename}` };
    const error = validate(payload);
    if (error) { removeFile(payload.imagen); return res.status(400).json({ message: error }); }
    const item = await GaleriaImagen.create(payload);
    return res.status(201).json({ message: 'Imagen agregada a la Galería.', data: await GaleriaImagen.findByPk(item.id, { include: includeUsers }) });
  } catch (error) { if (req.file) removeFile(`/uploads/galeria/${req.file.filename}`); return next(error); }
};
exports.update = async (req, res, next) => {
  try {
    const item = await GaleriaImagen.findByPk(req.params.id);
    if (!item) { if (req.file) removeFile(`/uploads/galeria/${req.file.filename}`); return res.status(404).json({ message: 'Imagen de Galería no encontrada.' }); }
    if (req.file && rejectBadFile(req, res)) return undefined;
    const payload = payloadFrom(req.body, req.user.id);
    const error = validate(payload);
    if (error) { if (req.file) removeFile(`/uploads/galeria/${req.file.filename}`); return res.status(400).json({ message: error }); }
    const previous = item.imagen;
    if (req.file) payload.imagen = `/uploads/galeria/${req.file.filename}`;
    await item.update(payload);
    if (req.file && previous !== item.imagen) removeFile(previous);
    return res.json({ message: 'Imagen de Galería actualizada.', data: await GaleriaImagen.findByPk(item.id, { include: includeUsers }) });
  } catch (error) { if (req.file) removeFile(`/uploads/galeria/${req.file.filename}`); return next(error); }
};
exports.changeStatus = async (req, res, next) => {
  try {
    const item = await GaleriaImagen.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Imagen de Galería no encontrada.' });
    const estado = req.body.estado === 'PUBLICADO' ? 'PUBLICADO' : req.body.estado === 'NO_PUBLICADO' ? 'NO_PUBLICADO' : null;
    if (!estado) return res.status(400).json({ message: 'El estado no es válido.' });
    await item.update({ estado, modificadoPorId: req.user.id });
    return res.json({ message: estado === 'PUBLICADO' ? 'Imagen publicada.' : 'Imagen despublicada.', data: item });
  } catch (error) { return next(error); }
};
exports.remove = async (req, res, next) => {
  try {
    const item = await GaleriaImagen.findByPk(req.params.id);
    if (!item) return res.status(404).json({ message: 'Imagen de Galería no encontrada.' });
    const image = item.imagen;
    await item.destroy();
    removeFile(image);
    return res.json({ message: 'Imagen eliminada de la Galería.' });
  } catch (error) { return next(error); }
};
exports.publicList = async (_req, res, next) => {
  try {
    const rows = await GaleriaImagen.findAll({ where: { estado: 'PUBLICADO' }, attributes: ['id', 'titulo', 'descripcion', 'categoria', 'imagen', 'orden'], order: [['orden', 'ASC'], ['id', 'ASC']] });
    return res.json(rows);
  } catch (error) { return next(error); }
};

exports.validImageContent = validImageContent;
exports.payloadFrom = payloadFrom;
