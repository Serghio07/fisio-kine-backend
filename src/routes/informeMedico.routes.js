const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarInformes,
  obtenerInforme,
  crearInforme,
  actualizarInforme,
  eliminarInforme
} = require('../controllers/informeMedico.controller');

router.use(autenticar);

router.get('/', listarInformes);
router.get('/:id', obtenerInforme);
router.post('/', autorizarRoles('admin', 'personal'), crearInforme);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarInforme);
router.delete('/:id', autorizarRoles('admin'), eliminarInforme);

module.exports = router;
