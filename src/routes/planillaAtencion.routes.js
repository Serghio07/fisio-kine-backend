const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarPlanillas,
  obtenerPlanilla,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
  crearSesion,
  descargarPdf
} = require('../controllers/planillaAtencion.controller');

router.use(autenticar);

router.get('/', listarPlanillas);
router.get('/:id/pdf', descargarPdf);
router.get('/:id', obtenerPlanilla);
router.post('/', autorizarRoles('admin', 'personal'), crearPlanilla);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarPlanilla);
router.delete('/:id', autorizarRoles('admin'), eliminarPlanilla);
router.post('/:id/sesiones', autorizarRoles('admin', 'personal'), crearSesion);

module.exports = router;
