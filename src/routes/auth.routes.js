const router = require('express').Router();
const { login, solicitarAcceso } = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/solicitar-acceso', solicitarAcceso);

module.exports = router;
