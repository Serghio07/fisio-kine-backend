const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/resumenDiario.controller');

router.use(autenticar);
router.get('/', controller.obtenerResumenDiario);
router.post('/observaciones', autorizarRoles('admin', 'personal'), controller.crearObservacion);
router.put('/observaciones/:id', autorizarRoles('admin', 'personal'), controller.actualizarObservacion);

module.exports = router;
