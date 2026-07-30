const { Op, fn, col } = require('sequelize');
const {
  BlogPost, BlogCategory, BlogTag, Usuario, sequelize
} = require('../models');
const { slugify, sanitizeBlogHtml, plainText, readingTime } = require('../utils/blog');
const fs = require('fs');
const path = require('path');

const authorAttributes = ['id', 'nombre', 'usuario'];
const includePost = [
  { model: BlogCategory, as: 'categoria', attributes: ['id', 'nombre', 'slug', 'activo'] },
  { model: Usuario, as: 'autor', attributes: authorAttributes },
  { model: Usuario, as: 'modificado_por', attributes: authorAttributes },
  { model: Usuario, as: 'publicado_por', attributes: authorAttributes },
  { model: BlogTag, as: 'etiquetas', attributes: ['id', 'nombre', 'slug'], through: { attributes: [] } }
];
const asPositiveInt = (value, fallback, max = 100) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));
const isAdmin = (req) => req.user?.rol === 'admin';
const canEdit = (req, post) => isAdmin(req) || (post.autorId === req.user.id && post.estado === 'BORRADOR');
const removeOrphanImage = async (url) => {
  if (!url?.startsWith('/uploads/blog/')) return;
  const inUse = await BlogPost.count({ where: { imagenPortada: url }, paranoid: false });
  if (inUse) return;
  const base = path.resolve(__dirname, '../../uploads/blog');
  const target = path.resolve(base, path.basename(url));
  if (target.startsWith(`${base}${path.sep}`) && fs.existsSync(target)) fs.unlinkSync(target);
};

const normalizePayload = (body, current = {}) => {
  const payload = {};
  const fields = ['titulo', 'resumen', 'imagenPortada', 'imagenAlt', 'seoTitulo', 'seoDescripcion', 'palabrasClave'];
  fields.forEach((field) => {
    if (body[field] !== undefined) payload[field] = String(body[field] || '').trim() || null;
  });
  if (body.titulo !== undefined) payload.titulo = String(body.titulo || '').trim();
  if (body.slug !== undefined || body.titulo !== undefined) payload.slug = slugify(body.slug || body.titulo || current.titulo);
  if (body.contenido !== undefined) {
    payload.contenido = sanitizeBlogHtml(body.contenido);
    payload.tiempoLectura = readingTime(payload.contenido);
  }
  if (body.categoriaId !== undefined) payload.categoriaId = body.categoriaId ? Number(body.categoriaId) : null;
  if (body.destacado !== undefined) payload.destacado = body.destacado === true || body.destacado === 'true';
  if (body.fechaPublicacion !== undefined) payload.fechaPublicacion = body.fechaPublicacion ? new Date(body.fechaPublicacion) : null;
  return payload;
};

const syncTags = async (post, tags, transaction) => {
  if (!Array.isArray(tags)) return;
  const clean = [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 15);
  const records = [];
  for (const nombre of clean) {
    const slug = slugify(nombre);
    if (!slug) continue;
    const [tag] = await BlogTag.findOrCreate({ where: { slug }, defaults: { nombre, slug }, transaction });
    records.push(tag);
  }
  await post.setEtiquetas(records, { transaction });
};

const validatePublish = async (post) => {
  const required = [
    ['titulo', 'El título es obligatorio.'], ['slug', 'El slug es obligatorio.'],
    ['resumen', 'El resumen es obligatorio.'], ['contenido', 'El contenido es obligatorio.'],
    ['imagenPortada', 'La imagen de portada es obligatoria.']
  ];
  const errors = required.filter(([field]) => !post[field] || (field === 'contenido' && !plainText(post[field]))).map(([, message]) => message);
  if (post.resumen && (post.resumen.length < 40 || post.resumen.length > 300)) errors.push('El resumen debe tener entre 40 y 300 caracteres.');
  const category = post.categoriaId ? await BlogCategory.findByPk(post.categoriaId) : null;
  if (post.categoriaId && (!category || !category.activo)) errors.push('La categoría seleccionada no está activa.');
  if (errors.length) {
    const error = new Error(errors.join(' '));
    error.status = 400;
    error.errors = errors;
    throw error;
  }
};

exports.listAdmin = async (req, res, next) => {
  try {
    const page = asPositiveInt(req.query.page, 1, 100000);
    const limit = asPositiveInt(req.query.limit, 10, 50);
    const where = {};
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.categoriaId) where.categoriaId = Number(req.query.categoriaId);
    if (req.query.fecha) where.fechaPublicacion = { [Op.gte]: new Date(`${req.query.fecha}T00:00:00`), [Op.lt]: new Date(`${req.query.fecha}T23:59:59.999`) };
    if (req.query.search) {
      const search = `%${req.query.search.trim()}%`;
      where[Op.or] = [{ titulo: { [Op.iLike]: search } }, { resumen: { [Op.iLike]: search } }, { slug: { [Op.iLike]: search } }];
    }
    if (!isAdmin(req)) where.autorId = req.user.id;
    const { rows, count } = await BlogPost.findAndCountAll({
      where, include: includePost, distinct: true,
      order: [['updated_at', 'DESC']], limit, offset: (page - 1) * limit
    });
    const statsWhere = !isAdmin(req) ? { autorId: req.user.id } : {};
    const grouped = await BlogPost.findAll({ attributes: ['estado', [fn('COUNT', col('id')), 'total']], where: statsWhere, group: ['estado'], raw: true });
    const stats = { total: grouped.reduce((sum, item) => sum + Number(item.total), 0), PUBLICADO: 0, BORRADOR: 0, OCULTO: 0, ARCHIVADO: 0 };
    grouped.forEach((item) => { stats[item.estado] = Number(item.total); });
    res.json({ data: rows, pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) }, stats });
  } catch (error) { next(error); }
};

exports.getAdmin = async (req, res, next) => {
  try {
    const post = await BlogPost.findByPk(req.params.id, { include: includePost });
    if (!post || (!isAdmin(req) && post.autorId !== req.user.id)) return res.status(404).json({ message: 'Artículo no encontrado.' });
    return res.json(post);
  } catch (error) { return next(error); }
};

exports.create = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const payload = normalizePayload(req.body);
    if (!payload.titulo) {
      await transaction.rollback();
      return res.status(400).json({ message: 'El título es obligatorio para guardar un borrador.' });
    }
    payload.autorId = req.user.id;
    payload.modificadoPorId = req.user.id;
    payload.estado = 'BORRADOR';
    const post = await BlogPost.create(payload, { transaction });
    await syncTags(post, req.body.etiquetas, transaction);
    await transaction.commit();
    res.status(201).json({ message: 'Borrador creado correctamente.', data: await BlogPost.findByPk(post.id, { include: includePost }) });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

exports.update = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const post = await BlogPost.findByPk(req.params.id, { transaction });
    if (!post) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Artículo no encontrado.' });
    }
    if (!canEdit(req, post)) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Solo puedes editar tus propios borradores.' });
    }
    const previousImage = post.imagenPortada;
    const payload = normalizePayload(req.body, post);
    if (post.estado === 'PUBLICADO' && req.body.slug === undefined) delete payload.slug;
    payload.modificadoPorId = req.user.id;
    await post.update(payload, { transaction });
    await syncTags(post, req.body.etiquetas, transaction);
    await transaction.commit();
    if (previousImage && previousImage !== post.imagenPortada) await removeOrphanImage(previousImage);
    res.json({ message: 'Artículo actualizado correctamente.', data: await BlogPost.findByPk(post.id, { include: includePost }) });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); next(error); }
};

const changeStatus = (estado) => async (req, res, next) => {
  try {
    const post = await BlogPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Artículo no encontrado.' });
    const personalCanPublishOwnDraft = estado === 'PUBLICADO'
      && post.autorId === req.user.id
      && post.estado === 'BORRADOR';
    if (!isAdmin(req) && !personalCanPublishOwnDraft) {
      return res.status(403).json({ message: 'No tienes permiso para cambiar este estado.' });
    }
    const changes = { estado, modificadoPorId: req.user.id };
    if (estado === 'PUBLICADO') {
      await validatePublish(post);
      changes.publicadoPorId = req.user.id;
      changes.fechaPublicacion = post.fechaPublicacion || new Date();
      changes.fechaOcultamiento = null;
    }
    if (estado === 'OCULTO') changes.fechaOcultamiento = new Date();
    if (estado === 'BORRADOR') changes.fechaOcultamiento = null;
    await post.update(changes);
    res.json({ message: `Artículo cambiado a ${estado.toLowerCase()}.`, data: post });
  } catch (error) { next(error); }
};
exports.publish = changeStatus('PUBLICADO');
exports.hide = changeStatus('OCULTO');
exports.archive = changeStatus('ARCHIVADO');
exports.restore = changeStatus('BORRADOR');

exports.remove = async (req, res, next) => {
  try {
    const post = await BlogPost.findByPk(req.params.id);
    if (!post) return res.status(404).json({ message: 'Artículo no encontrado.' });
    await post.destroy();
    res.json({ message: 'Artículo eliminado de manera lógica.' });
  } catch (error) { next(error); }
};

exports.upload = (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Selecciona una imagen válida.' });
  const bytes = fs.readFileSync(req.file.path).subarray(0, 12);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'El contenido del archivo no corresponde a una imagen permitida.' });
  }
  return res.status(201).json({
    message: 'Imagen cargada correctamente.',
    data: { url: `/uploads/blog/${req.file.filename}`, nombre: req.file.originalname, size: req.file.size }
  });
};

exports.listCategories = async (req, res, next) => {
  try {
    const admin = isAdmin(req);
    res.json(await BlogCategory.findAll({
      ...(admin ? {} : { where: { activo: true } }),
      order: [['nombre', 'ASC']],
      paranoid: !admin || req.query.incluirEliminadas !== 'true'
    }));
  } catch (error) { next(error); }
};
exports.createCategory = async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ message: 'El nombre es obligatorio.' });
    const category = await BlogCategory.create({ nombre, slug: slugify(req.body.slug || nombre), descripcion: req.body.descripcion || null, activo: req.body.activo !== false });
    res.status(201).json({ message: 'Categoría creada correctamente.', data: category });
  } catch (error) { next(error); }
};
exports.updateCategory = async (req, res, next) => {
  try {
    const category = await BlogCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });
    await category.update({ nombre: req.body.nombre ?? category.nombre, slug: slugify(req.body.slug || req.body.nombre || category.slug), descripcion: req.body.descripcion ?? category.descripcion, activo: req.body.activo ?? category.activo });
    res.json({ message: 'Categoría actualizada correctamente.', data: category });
  } catch (error) { next(error); }
};
exports.toggleCategory = async (req, res, next) => {
  try {
    const category = await BlogCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });
    await category.update({ activo: req.body.activo === true });
    res.json({ message: 'Estado de categoría actualizado.', data: category });
  } catch (error) { next(error); }
};
exports.removeCategory = async (req, res, next) => {
  try {
    const category = await BlogCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Categoría no encontrada.' });
    const count = await BlogPost.count({ where: { categoriaId: category.id } });
    if (count) return res.status(409).json({ message: `No se puede eliminar: ${count} artículo(s) utilizan esta categoría.`, count });
    await category.destroy();
    res.json({ message: 'Categoría eliminada.' });
  } catch (error) { next(error); }
};

const publicWhere = () => ({ estado: 'PUBLICADO', fechaPublicacion: { [Op.lte]: new Date() } });
const publicInclude = [
  { model: BlogCategory, as: 'categoria', attributes: ['nombre', 'slug'], where: { activo: true } },
  { model: Usuario, as: 'autor', attributes: ['nombre'] },
  { model: BlogTag, as: 'etiquetas', attributes: ['nombre', 'slug'], through: { attributes: [] } }
];
const publicAttributes = { exclude: ['autorId', 'modificadoPorId', 'publicadoPorId', 'fechaOcultamiento', 'deletedAt'] };

exports.publicList = async (req, res, next) => {
  try {
    const page = asPositiveInt(req.query.page, 1, 100000);
    const limit = asPositiveInt(req.query.limit, 9, 30);
    const where = publicWhere();
    if (req.query.search) {
      const search = `%${req.query.search.trim()}%`;
      where[Op.or] = [{ titulo: { [Op.iLike]: search } }, { resumen: { [Op.iLike]: search } }, { contenido: { [Op.iLike]: search } }];
    }
    const categoryWhere = { activo: true };
    if (req.query.category) categoryWhere.slug = req.query.category;
    const include = [
      { model: BlogCategory, as: 'categoria', attributes: ['nombre', 'slug'], where: categoryWhere },
      { model: Usuario, as: 'autor', attributes: ['nombre'] },
      { model: BlogTag, as: 'etiquetas', attributes: ['nombre', 'slug'], through: { attributes: [] }, ...(req.query.tag ? { where: { slug: req.query.tag } } : {}) }
    ];
    const { rows, count } = await BlogPost.findAndCountAll({
      where, include, attributes: publicAttributes, distinct: true,
      order: [['destacado', 'DESC'], ['fechaPublicacion', 'DESC']],
      limit, offset: (page - 1) * limit
    });
    res.json({ data: rows, pagination: { page, limit, total: count, totalPages: Math.max(1, Math.ceil(count / limit)) } });
  } catch (error) { next(error); }
};
exports.publicDetail = async (req, res, next) => {
  try {
    const post = await BlogPost.findOne({ where: { ...publicWhere(), slug: req.params.slug }, include: publicInclude, attributes: publicAttributes });
    if (!post) return res.status(404).json({ message: 'Artículo no encontrado.' });
    return res.json(post);
  } catch (error) { return next(error); }
};
exports.publicCategories = async (_req, res, next) => {
  try {
    const categories = await BlogCategory.findAll({
      where: { activo: true },
      attributes: ['id', 'nombre', 'slug', 'descripcion', [fn('COUNT', col('articulos.id')), 'cantidad']],
      include: [{ model: BlogPost, as: 'articulos', attributes: [], required: false, where: publicWhere() }],
      group: ['BlogCategory.id'], order: [['nombre', 'ASC']], subQuery: false
    });
    res.json(categories);
  } catch (error) { next(error); }
};
exports.publicFeatured = async (_req, res, next) => {
  try { res.json(await BlogPost.findAll({ where: { ...publicWhere(), destacado: true }, include: publicInclude, attributes: publicAttributes, order: [['fechaPublicacion', 'DESC']], limit: 6 })); } catch (error) { next(error); }
};
exports.publicRelated = async (req, res, next) => {
  try {
    const current = await BlogPost.findOne({ where: { ...publicWhere(), slug: req.params.slug } });
    if (!current) return res.status(404).json({ message: 'Artículo no encontrado.' });
    const rows = await BlogPost.findAll({ where: { ...publicWhere(), id: { [Op.ne]: current.id }, categoriaId: current.categoriaId }, include: publicInclude, attributes: publicAttributes, order: [['fechaPublicacion', 'DESC']], limit: 3 });
    return res.json(rows);
  } catch (error) { return next(error); }
};
