const fs = require('fs');
const path = require('path');
const { sequelize, AdjuntoHistoriaClinica, HistoriaClinica, Paciente, Sesion, Usuario } = require('../models');
const { uploadDir } = require('../middlewares/adjuntoHistoriaUpload.middleware');

const TIPOS = AdjuntoHistoriaClinica.TIPOS_ADJUNTO;
const MIME_SIGNATURES = {
  'application/pdf': (buffer) => buffer.subarray(0, 4).toString() === '%PDF',
  'image/jpeg': (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
};

const includeAdjunto = [
  { model: Paciente, as: 'paciente', attributes: ['id', 'nombres', 'apellidos'] },
  { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico', 'motivo_consulta'] },
  { model: Sesion, as: 'sesion', attributes: ['id', 'numero_sesion', 'fecha'] },
  { model: Usuario, as: 'creadoPor', attributes: ['id', 'nombre', 'usuario'] }
];

const safeUnlink = async (filePath) => { try { await fs.promises.unlink(filePath); } catch (error) { if (error.code !== 'ENOENT') throw error; } };
const cleanFiles = async (files = []) => Promise.all(files.map((file) => safeUnlink(file.path)));
const parseMetadata = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
};
const filePathFor = (adjunto) => {
  const base = path.resolve(uploadDir);
  const resolved = path.resolve(base, path.basename(adjunto.archivo));
  if (!resolved.startsWith(`${base}${path.sep}`)) throw Object.assign(new Error('Ruta de archivo inválida.'), { status: 400 });
  return resolved;
};
const validateContext = async (historiaId, pacienteId, sesionId, transaction) => {
  const historia = await HistoriaClinica.findOne({ where: { id: historiaId, paciente_id: pacienteId, anulada: false }, transaction });
  if (!historia) return 'La historia clínica no pertenece al paciente o está anulada.';
  if (sesionId) {
    const sesion = await Sesion.findOne({ where: { id: sesionId, paciente_id: pacienteId, historia_clinica_id: historiaId, anulada: false }, transaction });
    if (!sesion) return 'La sesión no pertenece al paciente y a la historia seleccionados.';
  }
  return null;
};

exports.list = async (req, res, next) => {
  try {
    const historia = await HistoriaClinica.findByPk(req.params.historiaId);
    if (!historia) return res.status(404).json({ message: 'Historia clínica no encontrada.' });
    const adjuntos = await AdjuntoHistoriaClinica.findAll({ where: { historia_clinica_id: historia.id, activo: true, eliminado: false }, include: includeAdjunto, order: [['created_at', 'DESC'], ['id', 'DESC']] });
    return res.json(adjuntos);
  } catch (error) { return next(error); }
};

exports.counts = async (_req, res, next) => {
  try {
    const rows = await AdjuntoHistoriaClinica.findAll({
      attributes: ['historia_clinica_id', [sequelize.fn('COUNT', sequelize.col('id')), 'cantidad']],
      where: { activo: true, eliminado: false },
      group: ['historia_clinica_id'],
      raw: true
    });
    return res.json(Object.fromEntries(rows.map((row) => [row.historia_clinica_id, Number(row.cantidad)])));
  } catch (error) { return next(error); }
};

exports.create = async (req, res, next) => {
  const files = req.files || [];
  const transaction = await sequelize.transaction();
  try {
    if (!files.length) throw Object.assign(new Error('Selecciona al menos un archivo.'), { status: 400 });
    const metadata = parseMetadata(req.body.metadatos);
    if (metadata.length !== files.length) throw Object.assign(new Error('Registra los metadatos de cada archivo.'), { status: 400 });
    const pacienteId = Number(req.body.paciente_id);
    const historiaId = Number(req.params.historiaId);
    const created = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const meta = metadata[index] || {};
      const signature = MIME_SIGNATURES[file.mimetype];
      const buffer = await fs.promises.readFile(file.path);
      if (!signature || !signature(buffer)) throw Object.assign(new Error(`El contenido real de ${file.originalname} no corresponde a PDF, JPG o PNG.`), { status: 400 });
      if (!TIPOS.includes(meta.tipo_adjunto)) throw Object.assign(new Error('Tipo de adjunto no válido.'), { status: 400 });
      if (!String(meta.titulo || '').trim()) throw Object.assign(new Error('El título es obligatorio para cada archivo.'), { status: 400 });
      const contextError = await validateContext(historiaId, pacienteId, meta.sesion_id || null, transaction);
      if (contextError) throw Object.assign(new Error(contextError), { status: 400 });
      created.push(await AdjuntoHistoriaClinica.create({
        paciente_id: pacienteId, historia_clinica_id: historiaId, sesion_id: meta.sesion_id || null,
        tipo_adjunto: meta.tipo_adjunto, titulo: String(meta.titulo).trim(), descripcion: String(meta.descripcion || '').trim() || null,
        fecha_documento: meta.fecha_documento || null, archivo: path.basename(file.filename), nombre_archivo_original: path.basename(file.originalname),
        mime_type: file.mimetype, tamano_bytes: file.size, creado_por_id: req.usuario.id
      }, { transaction }));
    }
    await transaction.commit();
    const result = await AdjuntoHistoriaClinica.findAll({ where: { id: created.map((item) => item.id) }, include: includeAdjunto });
    return res.status(201).json(result);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    await cleanFiles(files);
    return next(error);
  }
};

const findActive = (id) => AdjuntoHistoriaClinica.findOne({ where: { id, activo: true, eliminado: false }, include: includeAdjunto });
exports.get = async (req, res, next) => { try { const item = await findActive(req.params.id); return item ? res.json(item) : res.status(404).json({ message: 'Adjunto no encontrado.' }); } catch (error) { return next(error); } };
exports.file = (download) => async (req, res, next) => { try { const item = await findActive(req.params.id); if (!item) return res.status(404).json({ message: 'Adjunto no encontrado.' }); const filePath = filePathFor(item); await fs.promises.access(filePath); res.type(item.mime_type); res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(item.nombre_archivo_original)}`); return res.sendFile(filePath); } catch (error) { return next(error); } };
exports.remove = async (req, res, next) => { try { const item = await findActive(req.params.id); if (!item) return res.status(404).json({ message: 'Adjunto no encontrado.' }); await item.update({ activo: false, eliminado: true, fecha_eliminacion: new Date(), eliminado_por_id: req.usuario.id }); return res.json({ message: 'Adjunto eliminado lógicamente.' }); } catch (error) { return next(error); } };
