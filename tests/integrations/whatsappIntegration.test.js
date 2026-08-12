const assert = require('node:assert/strict');
const test = require('node:test');

const integration = require('../../src/services/whatsappIntegration.service');
const controller = require('../../src/controllers/whatsappIntegration.controller');
const autorizarRoles = require('../../src/middlewares/role.middleware');

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('status WhatsApp expone configuracion segura sin secretos ni IDs', () => {
  const names = ['WHATSAPP_ENABLED', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_VERSION', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_BUSINESS_ACCOUNT_ID'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    WHATSAPP_ENABLED: 'true', WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123456789',
    WHATSAPP_API_VERSION: 'v26.0', WHATSAPP_VERIFY_TOKEN: 'verify', WHATSAPP_APP_SECRET: 'secret',
    WHATSAPP_BUSINESS_ACCOUNT_ID: '987'
  });
  try {
    const status = integration.getStatus();
    assert.deepEqual(status, {
      enabled: true,
      configured: true,
      phoneNumberConfigured: true,
      webhookConfigured: true,
      apiVersion: 'v26.0',
      lastVerification: null,
      lastVerificationStatus: null
    });
    assert.doesNotMatch(JSON.stringify(status), /token|secret|123456789|987/i);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});

test('send-test normaliza el numero y reutiliza el servicio existente', async () => {
  let received;
  const result = await integration.sendTest('76543210', {
    sendMessage: async (to, message) => { received = { to, message }; return { success: true, messageId: 'sensible-id' }; }
  });
  assert.equal(result.success, true);
  assert.equal(received.to, '59176543210');
  assert.match(received.message, /Physio Active/);
});

test('send-test rechaza numero invalido antes de enviar', async () => {
  let called = false;
  const result = await integration.sendTest('abc', { sendMessage: async () => { called = true; } });
  assert.equal(result.code, 'INVALID_RECIPIENT');
  assert.equal(called, false);
});

test('controlador de envio no devuelve messageId de Meta', async () => {
  const original = integration.sendTest;
  integration.sendTest = async () => ({ success: true, messageId: 'wamid.sensible' });
  try {
    const res = response();
    await controller.sendTest({ body: { to: '59176543210' } }, res, (error) => { throw error; });
    assert.deepEqual(res.body, { success: true, message: 'Mensaje de prueba aceptado por WhatsApp.' });
  } finally { integration.sendTest = original; }
});

test('PERSONAL es rechazado por el middleware real de roles', () => {
  const res = response();
  let continued = false;
  autorizarRoles('admin')(
    { user: { rol: 'personal' }, body: {}, query: {}, method: 'GET', originalUrl: '/api/whatsapp/status' },
    res,
    () => { continued = true; }
  );
  assert.equal(continued, false);
  assert.equal(res.statusCode, 403);
});

test('rutas administrativas existen sin alterar rutas publicas del webhook', () => {
  const router = require('../../src/routes/whatsapp.routes');
  const routes = router.stack.filter((layer) => layer.route).map((layer) => ({ path: layer.route.path, methods: layer.route.methods }));
  assert.ok(routes.some((route) => route.path === '/webhook' && route.methods.get));
  assert.ok(routes.some((route) => route.path === '/webhook' && route.methods.post));
  assert.ok(routes.some((route) => route.path === '/status' && route.methods.get));
  assert.ok(routes.some((route) => route.path === '/verify-connection' && route.methods.post));
  assert.ok(routes.some((route) => route.path === '/send-test' && route.methods.post));
});
