const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { filtrarRespuestaFinanciera, sanearEntradaFinanciera } = require('../middlewares/financialAccess.middleware');
const {
  listarRegistros,
  obtenerRegistro,
  recalcularSemana,
  crearRegistro,
  actualizarRegistro,
  eliminarRegistro
} = require('../controllers/registroSemanal.controller');

router.use(autenticar, filtrarRespuestaFinanciera);

router.get('/', listarRegistros);
router.post('/recalcular', autorizarRoles('admin', 'personal'), recalcularSemana);
router.get('/:id', obtenerRegistro);
router.post('/', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, crearRegistro);
router.put('/:id', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, actualizarRegistro);
router.delete('/:id', autorizarRoles('admin'), eliminarRegistro);

module.exports = router;
