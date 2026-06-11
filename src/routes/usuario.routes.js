const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarUsuarios,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  eliminarUsuario
} = require('../controllers/usuario.controller');

router.use(autenticar);
router.use(autorizarRoles('admin'));

router.get('/', listarUsuarios);
router.get('/:id', obtenerUsuario);
router.post('/', crearUsuario);
router.put('/:id', actualizarUsuario);
router.patch('/:id/estado', cambiarEstadoUsuario);
router.delete('/:id', eliminarUsuario);

module.exports = router;
