const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const uploadDir = path.resolve(__dirname, '../../uploads/blog');
fs.mkdirSync(uploadDir, { recursive: true });

const allowed = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDir),
  filename: (_req, file, callback) => {
    const extension = allowed.get(file.mimetype) || '.img';
    callback(null, `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${extension}`);
  }
});

const uploadBlogImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowed.has(file.mimetype)) return callback(new Error('Solo se permiten imágenes JPG, PNG o WebP.'));
    return callback(null, true);
  }
});

module.exports = uploadBlogImage;
