const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  listarPacientes,
  obtenerPaciente,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente
} = require('../controllers/paciente.controller');

router.use(autenticar);

router.get('/', listarPacientes);
router.get('/:id', obtenerPaciente);
router.post('/', autorizarRoles('admin', 'personal'), crearPaciente);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarPaciente);
router.delete('/:id', autorizarRoles('admin'), eliminarPaciente);

module.exports = router;
