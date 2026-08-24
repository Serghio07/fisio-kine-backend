const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDir = path.resolve(__dirname, '../../uploads/adjuntos-historia');
fs.mkdirSync(uploadDir, { recursive: true });
const allowed = new Map([['application/pdf', '.pdf'], ['image/jpeg', '.jpg'], ['image/png', '.png']]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${allowed.get(file.mimetype) || '.bin'}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, callback) => allowed.has(file.mimetype)
    ? callback(null, true)
    : callback(Object.assign(new Error('Solo se permiten archivos PDF, JPG, JPEG o PNG.'), { status: 400 }))
});

const uploadArray = upload.array('archivos', 5);
const uploadAdjuntosHistoria = (req, res, next) => uploadArray(req, res, async (error) => {
  if (!error) return next();
  await Promise.all((req.files || []).map((file) => fs.promises.unlink(file.path).catch(() => {})));
  error.status = 400;
  if (error.code === 'LIMIT_FILE_SIZE') error.message = 'Cada adjunto puede pesar como máximo 10 MB.';
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') error.message = 'Se permiten como máximo 5 archivos por carga.';
  return next(error);
});

module.exports = { uploadAdjuntosHistoria, uploadDir };
