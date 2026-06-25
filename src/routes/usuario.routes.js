const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarUsuarios,
  listarProfesionalesActivos,
  obtenerUsuario,
  crearUsuario,
  actualizarUsuario,
  cambiarEstadoUsuario,
  revisarSolicitud,
  eliminarUsuario
} = require('../controllers/usuario.controller');

router.use(autenticar);

router.get('/profesionales/activos', listarProfesionalesActivos);

router.use(autorizarRoles('admin'));

router.get('/', listarUsuarios);
router.get('/:id', obtenerUsuario);
router.post('/', crearUsuario);
router.put('/:id', actualizarUsuario);
router.patch('/:id/estado', cambiarEstadoUsuario);
router.patch('/:id/solicitud', revisarSolicitud);
router.delete('/:id', eliminarUsuario);

module.exports = router;
