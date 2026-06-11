const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarHistorias,
  obtenerHistoria,
  listarHistoriasPorPaciente,
  crearHistoria,
  actualizarHistoria,
  eliminarHistoria
} = require('../controllers/historiaClinica.controller');

router.use(autenticar);

router.get('/', listarHistorias);
router.get('/paciente/:pacienteId', listarHistoriasPorPaciente);
router.get('/:id', obtenerHistoria);
router.post('/', autorizarRoles('admin', 'personal'), crearHistoria);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarHistoria);
router.delete('/:id', autorizarRoles('admin'), eliminarHistoria);

module.exports = router;
