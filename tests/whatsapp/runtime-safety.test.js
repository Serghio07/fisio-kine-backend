const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_NAME = 'fisio_kine_db';
process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
process.env.WHATSAPP_APPOINTMENTS_ENABLED = 'false';
process.env.WHATSAPP_TEST_MODE = 'true';
process.env.WHATSAPP_TEST_NUMBERS = '59170000001';
process.env.WHATSAPP_PHONE_NUMBER = '59162295637';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id-test';
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'business-id-test';
process.env.WHATSAPP_ACCESS_TOKEN = 'access-token-test';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-test';
process.env.WHATSAPP_WEBHOOK_SECRET = 'webhook-secret-test';
process.env.WHATSAPP_API_VERSION = 'v23.0';

const { validateRuntimeSafety, safeConfigSummary } = require('../../src/config/whatsapp');

test('impide modo prueba de WhatsApp contra la base activa', () => {
  const validation = validateRuntimeSafety();
  assert.equal(validation.ready, false);
  assert.equal(validation.errors.includes('WHATSAPP_TEST_DATABASE_REQUIRED'), true);
});

test('resumen seguro no contiene credenciales', () => {
  const summary = safeConfigSummary();
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(process.env.WHATSAPP_ACCESS_TOKEN), false);
  assert.equal(serialized.includes(process.env.WHATSAPP_WEBHOOK_SECRET), false);
  assert.equal(summary.authorizedNumbers, 1);
});
