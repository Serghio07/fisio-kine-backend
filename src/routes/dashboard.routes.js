const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const { filtrarRespuestaFinanciera } = require('../middlewares/financialAccess.middleware');
const {
  pacientesRecientes,
  proximasCitas,
  resumenDashboard,
  sesionesHoy,
  notificaciones,
  resumenJornada
} = require('../controllers/dashboard.controller');

router.use(autenticar, filtrarRespuestaFinanciera);

router.get('/resumen', resumenDashboard);
router.get('/proximas-citas', proximasCitas);
router.get('/sesiones-hoy', sesionesHoy);
router.get('/pacientes-recientes', pacientesRecientes);
router.get('/notificaciones', notificaciones);
router.get('/resumen-jornada', resumenJornada);

module.exports = router;
