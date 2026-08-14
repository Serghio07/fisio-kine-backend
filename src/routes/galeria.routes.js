const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const upload = require('../middlewares/galeriaUpload.middleware');
const controller = require('../controllers/galeria.controller');

router.use(autenticar, autorizarRoles('admin', 'personal'));
router.get('/', controller.listAdmin);
router.post('/', upload.single('imagen'), controller.create);
router.get('/:id', controller.getAdmin);
router.put('/:id', upload.single('imagen'), controller.update);
router.patch('/:id/estado', controller.changeStatus);
router.delete('/:id', controller.remove);
module.exports = router;
