const router = require('express').Router({ mergeParams: true });
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/pacienteContacto.controller');

router.use(autenticar);
router.get('/', controller.listar);
router.post('/', autorizarRoles('admin', 'personal'), controller.crear);
router.patch('/:relacionId', autorizarRoles('admin', 'personal'), controller.actualizar);
router.post('/:relacionId/cerrar', autorizarRoles('admin', 'personal'), controller.cerrar);

module.exports = router;
