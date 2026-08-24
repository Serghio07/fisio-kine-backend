const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const { soloAdministradorFinanciero } = require('../middlewares/financialAccess.middleware');
const controller = require('../controllers/movimientoCaja.controller');

router.use(autenticar, soloAdministradorFinanciero);
router.get('/', controller.listar);
router.get('/resumen', controller.resumen);
router.get('/saldo', controller.saldo);
router.get('/:id', controller.obtener);
router.post('/', controller.crear);
router.post('/:id/anular', controller.anular);

module.exports = router;
