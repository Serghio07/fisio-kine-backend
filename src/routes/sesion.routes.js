const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { filtrarRespuestaFinanciera, sanearEntradaSesionConPago } = require('../middlewares/financialAccess.middleware');
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
router.post('/', autorizarRoles('admin', 'personal'), sanearEntradaSesionConPago, crearSesion);
router.put('/:id', autorizarRoles('admin', 'personal'), sanearEntradaSesionConPago, actualizarSesion);
router.delete('/:id', autorizarRoles('admin'), eliminarSesion);

module.exports = router;
