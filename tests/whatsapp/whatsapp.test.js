const test = require('node:test');
const assert = require('node:assert/strict');

process.env.WHATSAPP_WEBHOOK_ENABLED = 'true';
process.env.WHATSAPP_APPOINTMENTS_ENABLED = 'false';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-for-tests';
process.env.WHATSAPP_WEBHOOK_SECRET = 'webhook-secret-for-tests';
process.env.WHATSAPP_PHONE_NUMBER = '59162295637';
process.env.WHATSAPP_API_VERSION = 'v23.0';
process.env.WHATSAPP_TEST_MODE = 'true';
process.env.WHATSAPP_TEST_NUMBERS = '59170000001';

const app = require('../../src/app');
const {
  detectOrigin,
  extractWebhookEvents
} = require('../../src/utils/whatsapp');
const {
  calculateSignature,
  safeEqual
} = require('../../src/middlewares/whatsappSignature.middleware');
const {
  isTestNumberAllowed,
  validateBaseConfig,
  whatsappConfig
} = require('../../src/config/whatsapp');

let server;
let baseUrl;
let gateway;
let gatewayUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      process.env.WHATSAPP_BACKEND_URL = baseUrl;
      const { createGateway } = require('../../src/scripts/whatsappWebhookGateway');
      gateway = createGateway().listen(0, '127.0.0.1', () => {
        gatewayUrl = `http://127.0.0.1:${gateway.address().port}`;
        resolve();
      });
    });
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => gateway.close((error) => (error ? reject(error) : resolve())));
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('configuracion mantiene desactivada la creacion automatica de citas', () => {
  assert.equal(whatsappConfig.appointmentsEnabled, false);
  assert.deepEqual(validateBaseConfig(), []);
});

test('detecta REF:WEB-PHYSIO y diferencia mensajes directos', () => {
  assert.deepEqual(
    detectOrigin('Hola, quiero agendar. REF:WEB-PHYSIO'),
    { origin: 'WEB', reference: 'WEB-PHYSIO' }
  );
  assert.deepEqual(
    detectOrigin('Hola, escribo directamente'),
    { origin: 'WHATSAPP', reference: null }
  );
});

test('extrae mensajes y estados sin conservar el payload completo', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          messages: [{
            id: 'wamid.TEST-1',
            from: '+591 700-00001',
            timestamp: '1710000000',
            type: 'text',
            text: { body: 'Hola REF:WEB-PHYSIO' }
          }],
          statuses: [{
            id: 'wamid.OUT-1',
            status: 'delivered',
            timestamp: '1710000001'
          }]
        }
      }]
    }]
  };
  const events = extractWebhookEvents(payload);
  assert.equal(events.messages[0].from, '59170000001');
  assert.equal(events.messages[0].externalId, 'wamid.TEST-1');
  assert.equal(events.statuses[0].status, 'delivered');
  assert.equal(Object.hasOwn(events.messages[0], 'payload'), false);
});

test('modo prueba permite solo numeros declarados', () => {
  assert.equal(isTestNumberAllowed('+591 700-00001'), true);
  assert.equal(isTestNumberAllowed('59170000002'), false);
});

test('firma HMAC usa comparacion segura', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = calculateSignature(body, process.env.WHATSAPP_WEBHOOK_SECRET);
  assert.equal(signature.startsWith('sha256='), true);
  assert.equal(safeEqual(signature, signature), true);
  assert.equal(safeEqual(signature, 'sha256=incorrecta'), false);
});

test('GET verifica challenge y rechaza token incorrecto', async () => {
  const valid = await fetch(`${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-for-tests&hub.challenge=12345`);
  assert.equal(valid.status, 200);
  assert.equal(await valid.text(), '12345');

  const invalid = await fetch(`${baseUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=incorrecto&hub.challenge=12345`);
  assert.equal(invalid.status, 403);
});

test('POST rechaza firma incorrecta y acepta evento firmado', async () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const invalid = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=incorrecta' },
    body
  });
  assert.equal(invalid.status, 401);

  const valid = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': calculateSignature(Buffer.from(body), process.env.WHATSAPP_WEBHOOK_SECRET)
    },
    body
  });
  assert.equal(valid.status, 200);
});

test('gateway publica solo el webhook', async () => {
  const blocked = await fetch(`${gatewayUrl}/api/health`);
  assert.equal(blocked.status, 404);

  const webhook = await fetch(`${gatewayUrl}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token-for-tests&hub.challenge=gateway-ok`);
  assert.equal(webhook.status, 200);
  assert.equal(await webhook.text(), 'gateway-ok');
});
