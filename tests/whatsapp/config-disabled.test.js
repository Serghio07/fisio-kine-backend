const test = require('node:test');
const assert = require('node:assert/strict');

delete process.env.WHATSAPP_PHONE_NUMBER_ID;
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_VERIFY_TOKEN;
delete process.env.WHATSAPP_WEBHOOK_SECRET;
process.env.WHATSAPP_APPOINTMENTS_ENABLED = 'false';
process.env.WHATSAPP_WEBHOOK_ENABLED = 'false';

const app = require('../../src/app');
const { validateWhatsappConfig, whatsappConfig } = require('../../src/config/whatsapp');
const { sendTextMessage } = require('../../src/services/whatsapp.service');

test('backend puede cargarse sin credenciales cuando WhatsApp esta desactivado', () => {
  assert.equal(typeof app.listen, 'function');
  assert.equal(whatsappConfig.webhookEnabled, false);
  assert.equal(whatsappConfig.appointmentsEnabled, false);
  assert.deepEqual(validateWhatsappConfig('send'), { ready: false, reason: 'DISABLED' });
});

test('servicio de envio falla de forma controlada cuando esta desactivado', async () => {
  await assert.rejects(
    () => sendTextMessage('59170000001', 'Prueba'),
    (error) => error.code === 'DISABLED'
  );
});
