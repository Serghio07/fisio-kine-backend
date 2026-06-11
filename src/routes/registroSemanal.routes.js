const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarRegistros,
  obtenerRegistro,
  crearRegistro,
  actualizarRegistro,
  eliminarRegistro
} = require('../controllers/registroSemanal.controller');

router.use(autenticar);

router.get('/', listarRegistros);
router.get('/:id', obtenerRegistro);
router.post('/', autorizarRoles('admin', 'personal'), crearRegistro);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarRegistro);
router.delete('/:id', autorizarRoles('admin'), eliminarRegistro);

module.exports = router;
