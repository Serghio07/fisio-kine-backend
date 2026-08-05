const router = require('express').Router();
const validarFirmaWhatsapp = require('../middlewares/whatsappSignature.middleware');
const { verifyWebhook, receiveWebhook } = require('../controllers/whatsapp.controller');

router.get('/webhook', verifyWebhook);
router.post('/webhook', validarFirmaWhatsapp, receiveWebhook);

module.exports = router;
