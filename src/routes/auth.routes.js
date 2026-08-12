const router = require('express').Router();
const { forgotPassword, login, logout, resetPassword, solicitarAcceso } = require('../controllers/auth.controller');
const rateLimit = require('../middlewares/rateLimit.middleware');

router.post('/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Demasiados intentos. Intenta nuevamente en unos minutos.'
}), login);
router.post('/logout', logout);
router.post('/forgot-password', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiadas solicitudes. Intenta nuevamente mas tarde.'
}), forgotPassword);
router.post('/reset-password', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos. Intenta nuevamente en unos minutos.'
}), resetPassword);
router.post('/solicitar-acceso', rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.'
}), solicitarAcceso);

module.exports = router;
