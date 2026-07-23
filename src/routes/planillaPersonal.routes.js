const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarPlanillas,
  obtenerPlanilla,
  obtenerPorPeriodo,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
  cerrarPlanilla,
  reabrirPlanilla,
  anularPlanilla
} = require('../controllers/planillaPersonal.controller');

router.use(autenticar, autorizarRoles('admin'));
router.get('/', listarPlanillas);
router.get('/periodo/:anio/:mes', obtenerPorPeriodo);
router.get('/:id', obtenerPlanilla);
router.post('/', crearPlanilla);
router.put('/:id', actualizarPlanilla);
router.delete('/:id', eliminarPlanilla);
router.patch('/:id/cerrar', cerrarPlanilla);
router.patch('/:id/reabrir', reabrirPlanilla);
router.patch('/:id/anular', anularPlanilla);

module.exports = router;
