const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { filtrarRespuestaFinanciera } = require('../middlewares/financialAccess.middleware');
const {
  listarPacientes,
  validarDuplicados,
  obtenerPaciente,
  obtenerSeccionPaciente,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente,
  reactivarPaciente
} = require('../controllers/paciente.controller');
const { listarPlanillasPaciente } = require('../controllers/planillaAtencion.controller');
const { listarCitasPaciente } = require('../controllers/cita.controller');
const { resumenPaciente, auditarResumenPaciente } = require('../controllers/resumenPaciente.controller');

router.use(autenticar, filtrarRespuestaFinanciera);

router.get('/', listarPacientes);
router.get('/validar-duplicados', validarDuplicados);
router.get('/:id/resumen', resumenPaciente);
router.post('/:id/resumen/auditoria', auditarResumenPaciente);
router.get('/:id/citas', listarCitasPaciente);
router.get('/:id/planillas-atencion', listarPlanillasPaciente);
router.get('/:id/secciones/:seccion', obtenerSeccionPaciente);
router.get('/:id', obtenerPaciente);
router.post('/', autorizarRoles('admin', 'personal'), crearPaciente);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarPaciente);
router.put('/:id/reactivar', autorizarRoles('admin'), reactivarPaciente);
router.delete('/:id', autorizarRoles('admin'), eliminarPaciente);

module.exports = router;
