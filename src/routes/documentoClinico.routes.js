const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarDocumentos,
  obtenerDocumento,
  autocompletarPaciente,
  crearDocumento,
  actualizarDocumento,
  eliminarDocumento
} = require('../controllers/documentoClinico.controller');

router.use(autenticar);

router.get('/', listarDocumentos);
router.get('/autocompletar/:pacienteId', autocompletarPaciente);
router.get('/:id', obtenerDocumento);
router.post('/', autorizarRoles('admin', 'personal'), crearDocumento);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarDocumento);
router.delete('/:id', autorizarRoles('admin'), eliminarDocumento);

module.exports = router;
