const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { filtrarRespuestaFinanciera, sanearEntradaFinanciera } = require('../middlewares/financialAccess.middleware');
const {
  listarDocumentos,
  obtenerDocumento,
  autocompletarPaciente,
  crearDocumento,
  actualizarDocumento,
  eliminarDocumento
} = require('../controllers/documentoClinico.controller');

router.use(autenticar, filtrarRespuestaFinanciera);

router.get('/', listarDocumentos);
router.get('/autocompletar/:pacienteId', autocompletarPaciente);
router.get('/:id', obtenerDocumento);
router.post('/', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, crearDocumento);
router.put('/:id', autorizarRoles('admin', 'personal'), sanearEntradaFinanciera, actualizarDocumento);
router.delete('/:id', autorizarRoles('admin'), eliminarDocumento);

module.exports = router;
