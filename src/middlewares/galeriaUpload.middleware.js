const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDir = path.resolve(__dirname, '../../uploads/galeria');
fs.mkdirSync(uploadDir, { recursive: true });
const allowed = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp']]);

module.exports = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${allowed.get(file.mimetype) || '.img'}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => allowed.has(file.mimetype)
    ? callback(null, true)
    : callback(Object.assign(new Error('Solo se permiten imágenes JPG, PNG o WebP.'), { status: 400 }))
});
