const router = require('express').Router();
const controller = require('../controllers/galeria.controller');
router.get('/', controller.publicList);
module.exports = router;
