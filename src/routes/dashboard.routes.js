const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const {
  pacientesRecientes,
  proximasCitas,
  resumenDashboard,
  sesionesHoy
} = require('../controllers/dashboard.controller');

router.use(autenticar);

router.get('/resumen', resumenDashboard);
router.get('/proximas-citas', proximasCitas);
router.get('/sesiones-hoy', sesionesHoy);
router.get('/pacientes-recientes', pacientesRecientes);

module.exports = router;
