const router = require('express').Router();
const { login, registrar } = require('../controllers/auth.controller');

router.post('/login', login);
router.post('/register', registrar);

module.exports = router;
