const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/tareaPersonal.controller');

router.use(autenticar, autorizarRoles('admin'));
router.get('/', controller.listar);
router.post('/', controller.crear);
router.put('/:id', controller.actualizar);
router.patch('/:id/estado', controller.cambiarEstado);
router.delete('/:id', controller.eliminar);

module.exports = router;
