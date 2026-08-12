const router = require('express').Router();
const validarFirmaWhatsapp = require('../middlewares/whatsappSignature.middleware');
const { verifyWebhook, receiveWebhook } = require('../controllers/whatsapp.controller');
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const integration = require('../controllers/whatsappIntegration.controller');

router.get('/webhook', verifyWebhook);
router.post('/webhook', validarFirmaWhatsapp, receiveWebhook);
router.get('/status', autenticar, autorizarRoles('admin'), integration.status);
router.post('/verify-connection', autenticar, autorizarRoles('admin'), integration.verifyConnection);
router.post('/send-test', autenticar, autorizarRoles('admin'), integration.sendTest);

module.exports = router;
