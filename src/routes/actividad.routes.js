const router = require('express').Router();
const { listarActividades } = require('../controllers/actividad.controller');
const autenticar = require('../middlewares/auth.middleware');

router.use(autenticar);
router.get('/', listarActividades);

module.exports = router;
