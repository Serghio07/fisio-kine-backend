const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarPlanillas,
  obtenerPlanilla,
  obtenerPorPeriodo,
  crearPlanilla,
  actualizarPlanilla
} = require('../controllers/planillaPersonal.controller');

router.use(autenticar, autorizarRoles('admin'));
router.get('/', listarPlanillas);
router.get('/periodo/:anio/:mes', obtenerPorPeriodo);
router.get('/:id', obtenerPlanilla);
router.post('/', crearPlanilla);
router.put('/:id', actualizarPlanilla);

module.exports = router;
