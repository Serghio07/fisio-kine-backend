const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const { authorizeModule } = require('../middlewares/permission.middleware');
const controller = require('../controllers/planillaPagos.controller');

router.use(autenticar, authorizeModule('finanzas'));
router.get('/', controller.listar);
router.get('/resumen', controller.resumenFinanciero);
router.get('/pacientes/:pacienteId/resumen-financiero', controller.resumenFinancieroPaciente);
router.post('/conceptos', controller.crearConcepto);
router.post('/conceptos/:conceptoId/movimientos', controller.registrarMovimiento);
router.post('/historias/:historiaId/preview-pago-deuda', controller.previewPagoDeuda);
router.post('/historias/:historiaId/pagar-deuda', controller.pagarDeudaHistoria);
router.put('/movimientos/:id', controller.editarMovimiento);
router.patch('/movimientos/:id/anular', controller.anularMovimiento);
router.get('/operaciones/:id', controller.detalleOperacionPago);
router.patch('/operaciones/:id/anular', controller.anularOperacionPago);
router.get('/movimientos/:id/historial', controller.historialMovimiento);
router.get('/arqueos', controller.listarArqueos);
router.get('/arqueos/actual', controller.arqueoActual);
router.post('/arqueos/preview', controller.previewArqueo);
router.get('/arqueos/consolidado', controller.consolidadoArqueos);
router.get('/arqueos/:id', controller.detalleArqueo);
router.post('/arqueos', controller.guardarArqueo);
router.patch('/arqueos/:id/reabrir', controller.reabrirArqueo);

module.exports = router;
