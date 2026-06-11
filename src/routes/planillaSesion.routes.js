const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const { actualizarSesion, eliminarSesion } = require('../controllers/planillaAtencion.controller');

router.use(autenticar);

router.put('/:id', autorizarRoles('admin', 'personal'), actualizarSesion);
router.delete('/:id', autorizarRoles('admin'), eliminarSesion);

module.exports = router;
