const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { filtrarRespuestaFinanciera, sanearEntradaFinanciera } = require('../middlewares/financialAccess.middleware');
const {
  listarSesiones,
  obtenerSesion,
  crearSesion,
  actualizarSesion,
  eliminarSesion
} = require('../controllers/sesion.controller');

router.use(autenticar, filtrarRespuestaFinanciera);

router.get('/', listarSesiones);
router.get('/:id', obtenerSesion);
router.post('/', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, crearSesion);
router.put('/:id', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, actualizarSesion);
router.delete('/:id', autorizarRoles('admin'), eliminarSesion);

module.exports = router;
