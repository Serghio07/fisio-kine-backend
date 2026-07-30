const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const { soloAdministradorFinanciero } = require('../middlewares/financialAccess.middleware');
const controller = require('../controllers/planillaPagos.controller');

router.use(autenticar, soloAdministradorFinanciero);
router.get('/', controller.listar);
router.post('/conceptos', controller.crearConcepto);
router.post('/conceptos/:conceptoId/movimientos', controller.registrarMovimiento);
router.put('/movimientos/:id', controller.editarMovimiento);
router.patch('/movimientos/:id/anular', controller.anularMovimiento);
router.get('/movimientos/:id/historial', controller.historialMovimiento);
router.get('/arqueos', controller.listarArqueos);
router.post('/arqueos', controller.guardarArqueo);
router.patch('/arqueos/:id/reabrir', controller.reabrirArqueo);

module.exports = router;
