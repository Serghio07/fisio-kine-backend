const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarPersonal,
  obtenerPersonal,
  crearPersonal,
  actualizarPersonal,
  cambiarEstadoPersonal
} = require('../controllers/personal.controller');

router.use(autenticar, autorizarRoles('admin'));
router.get('/', listarPersonal);
router.get('/:id', obtenerPersonal);
router.post('/', crearPersonal);
router.put('/:id', actualizarPersonal);
router.patch('/:id/estado', cambiarEstadoPersonal);

module.exports = router;
