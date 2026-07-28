const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const upload = require('../middlewares/blogUpload.middleware');
const controller = require('../controllers/blog.controller');

router.use(autenticar);
router.get('/', controller.listAdmin);
router.get('/:id', controller.getAdmin);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id', controller.update);
router.post('/upload/imagen', upload.single('imagen'), controller.upload);
router.post('/:id/publicar', autorizarRoles('admin'), controller.publish);
router.post('/:id/ocultar', autorizarRoles('admin'), controller.hide);
router.post('/:id/archivar', autorizarRoles('admin'), controller.archive);
router.post('/:id/restaurar', autorizarRoles('admin'), controller.restore);
router.delete('/:id', autorizarRoles('admin'), controller.remove);

module.exports = router;
