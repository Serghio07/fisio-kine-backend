const router = require('express').Router();
const { login, logout, solicitarAcceso } = require('../controllers/auth.controller');
const rateLimit = require('../middlewares/rateLimit.middleware');

router.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos. Intenta nuevamente en unos minutos.'
}), login);
router.post('/logout', logout);
router.post('/solicitar-acceso', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.'
}), solicitarAcceso);

module.exports = router;
