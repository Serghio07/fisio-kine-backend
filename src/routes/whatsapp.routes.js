const express = require('express');
const { verifyWebhook, receiveWebhook } = require('../controllers/whatsapp.controller');
const { validateWhatsappSignature } = require('../middlewares/whatsappSignature.middleware');
const authenticate = require('../middlewares/auth.middleware');
const authorizeRoles = require('../middlewares/role.middleware');
const requireWhatsappSimulator = require('../middlewares/whatsappSimulator.middleware');
const simulator = require('../controllers/whatsappSimulator.controller');

const router = express.Router();

router.get('/webhook', verifyWebhook);
router.post(
  '/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  validateWhatsappSignature,
  receiveWebhook
);

router.use(
  '/simulator',
  express.json({ limit: '64kb' }),
  authenticate,
  authorizeRoles('admin'),
  requireWhatsappSimulator
);
router.post('/simulator/start', simulator.start);
router.post('/simulator/message', simulator.message);
router.post('/simulator/reset', simulator.reset);
router.get('/simulator/conversations/:id', simulator.conversation);
router.get('/simulator/conversations/:id/messages', simulator.messages);
router.get('/simulator/conversations/:id/audit', simulator.audit);

module.exports = router;
