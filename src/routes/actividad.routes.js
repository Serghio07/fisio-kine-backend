const router = require('express').Router();
const { listarActividades } = require('../controllers/actividad.controller');
const autenticar = require('../middlewares/auth.middleware');
const { filtrarRespuestaFinanciera } = require('../middlewares/financialAccess.middleware');

router.use(autenticar, filtrarRespuestaFinanciera);
router.get('/', listarActividades);

module.exports = router;
