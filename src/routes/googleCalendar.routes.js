const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/googleCalendar.controller');

router.get('/callback', controller.callback);
router.get('/auth', autenticar, autorizarRoles('admin'), controller.auth);
router.get('/status', autenticar, autorizarRoles('admin'), controller.status);

module.exports = router;
