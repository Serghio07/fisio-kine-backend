const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/planillaPagos.controller');

router.use(autenticar);
router.get('/', controller.listar);
router.post('/conceptos', autorizarRoles('admin', 'personal'), controller.crearConcepto);
router.post('/conceptos/:conceptoId/movimientos', autorizarRoles('admin', 'personal'), controller.registrarMovimiento);
router.put('/movimientos/:id', autorizarRoles('admin', 'personal'), controller.editarMovimiento);
router.patch('/movimientos/:id/anular', autorizarRoles('admin', 'personal'), controller.anularMovimiento);
router.get('/movimientos/:id/historial', controller.historialMovimiento);
router.get('/arqueos', controller.listarArqueos);
router.post('/arqueos', autorizarRoles('admin', 'personal'), controller.guardarArqueo);
router.patch('/arqueos/:id/reabrir', autorizarRoles('admin'), controller.reabrirArqueo);

module.exports = router;
