const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const rateLimit = require('../middlewares/rateLimit.middleware');
const { operationalSummary, chat } = require('../controllers/assistant.controller');

router.use(autenticar);
router.get('/resumen-operativo', operationalSummary);
router.post('/chat', rateLimit({ windowMs: 60 * 1000, max: 15, message: 'Has enviado demasiadas consultas. Espera un momento e inténtalo nuevamente.' }), chat);

module.exports = router;
