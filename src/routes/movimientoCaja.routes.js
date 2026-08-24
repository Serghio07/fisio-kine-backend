const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const controller = require('../controllers/movimientoCaja.controller');
const { authorizeModule } = require('../middlewares/permission.middleware');

router.use(autenticar, authorizeModule('finanzas'));
router.get('/', controller.listar);
router.get('/resumen', controller.resumen);
router.get('/saldo', controller.saldo);
router.get('/:id', controller.obtener);
router.post('/', controller.crear);
router.post('/:id/anular', controller.anular);

module.exports = router;
