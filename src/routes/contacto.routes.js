const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/contacto.controller');

router.use(autenticar);
router.get('/', controller.listar);
router.get('/:id/pacientes', controller.listarPacientes);
router.get('/:id', controller.obtener);
router.post('/', autorizarRoles('admin', 'personal'), controller.crear);
router.patch('/:id', autorizarRoles('admin', 'personal'), controller.actualizar);
router.post('/:id/desactivar', autorizarRoles('admin'), controller.desactivar);
router.post('/:id/reactivar', autorizarRoles('admin'), controller.reactivar);

module.exports = router;
