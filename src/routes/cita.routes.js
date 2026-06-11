const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const {
  actualizarCita,
  cambiarEstadoCita,
  crearCita,
  eliminarCita,
  listarCalendario,
  listarCitas,
  listarCitasHoy,
  listarCitasMes,
  listarCitasSemana,
  obtenerCita
} = require('../controllers/cita.controller');

router.use(autenticar);

router.get('/', listarCitas);
router.get('/calendario', listarCalendario);
router.get('/hoy', listarCitasHoy);
router.get('/semana', listarCitasSemana);
router.get('/mes', listarCitasMes);
router.get('/:id', obtenerCita);
router.post('/', autorizarRoles('admin', 'personal'), crearCita);
router.put('/:id', autorizarRoles('admin', 'personal'), actualizarCita);
router.patch('/:id/estado', autorizarRoles('admin', 'personal'), cambiarEstadoCita);
router.delete('/:id', autorizarRoles('admin'), eliminarCita);

module.exports = router;
