const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');

const configPath = require.resolve('../../src/config/whatsapp');
const middlewarePath = require.resolve('../../src/middlewares/whatsappSignature.middleware');

const loadMiddleware = () => {
  delete require.cache[configPath];
  delete require.cache[middlewarePath];
  return require(middlewarePath);
};

const mockResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('la configuracion solo se activa con true exacto', () => {
  const previous = process.env.WHATSAPP_ENABLED;
  for (const value of ['', 'false', '0', 'TRUE', 'yes']) {
    process.env.WHATSAPP_ENABLED = value;
    delete require.cache[configPath];
    assert.equal(require(configPath).getWhatsappConfig().enabled, false);
  }
  process.env.WHATSAPP_ENABLED = 'true';
  delete require.cache[configPath];
  assert.equal(require(configPath).getWhatsappConfig().enabled, true);
  if (previous === undefined) delete process.env.WHATSAPP_ENABLED;
  else process.env.WHATSAPP_ENABLED = previous;
});

test('informa solo los nombres de variables obligatorias faltantes', () => {
  const previous = {
    enabled: process.env.WHATSAPP_ENABLED,
    token: process.env.WHATSAPP_VERIFY_TOKEN,
    secret: process.env.WHATSAPP_APP_SECRET
  };
  process.env.WHATSAPP_ENABLED = 'true';
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  delete require.cache[configPath];
  const { getMissingWhatsappVariables } = require(configPath);
  assert.deepEqual(
    getMissingWhatsappVariables(['verifyToken', 'appSecret']),
    ['WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET']
  );
  if (previous.enabled === undefined) delete process.env.WHATSAPP_ENABLED;
  else process.env.WHATSAPP_ENABLED = previous.enabled;
  if (previous.token === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
  else process.env.WHATSAPP_VERIFY_TOKEN = previous.token;
  if (previous.secret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = previous.secret;
});

test('captura rawBody solo para el POST exacto del webhook', () => {
  const { captureWhatsappRawBody } = require(configPath);
  const body = Buffer.from('{"ok":true}');
  const webhookRequest = { method: 'POST', originalUrl: '/api/whatsapp/webhook?test=1' };
  const otherRequest = { method: 'POST', originalUrl: '/api/pacientes' };
  captureWhatsappRawBody(webhookRequest, {}, body);
  captureWhatsappRawBody(otherRequest, {}, body);
  assert.ok(Buffer.isBuffer(webhookRequest.rawBody));
  assert.deepEqual(webhookRequest.rawBody, body);
  assert.equal(otherRequest.rawBody, undefined);
});

test('express conserva los bytes y mantiene req.body parseado solo en el webhook', async (context) => {
  const { captureWhatsappRawBody } = require(configPath);
  const app = express();
  app.use(express.json({ verify: captureWhatsappRawBody }));
  app.post('/api/whatsapp/webhook', (req, res) => {
    res.json({ raw: req.rawBody.toString('base64'), parsed: req.body });
  });
  app.post('/otra-ruta', (req, res) => res.json({ hasRawBody: Buffer.isBuffer(req.rawBody), parsed: req.body }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const rawBody = Buffer.from('{ "valor": 1 }\n');
  const webhookResponse = await fetch(`http://127.0.0.1:${port}/api/whatsapp/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody
  });
  const webhookResult = await webhookResponse.json();
  assert.equal(webhookResult.raw, rawBody.toString('base64'));
  assert.deepEqual(webhookResult.parsed, { valor: 1 });

  const otherResponse = await fetch(`http://127.0.0.1:${port}/otra-ruta`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: rawBody
  });
  assert.deepEqual(await otherResponse.json(), { hasRawBody: false, parsed: { valor: 1 } });
});

test('acepta solo la firma HMAC del cuerpo original exacto', () => {
  const previous = {
    enabled: process.env.WHATSAPP_ENABLED,
    secret: process.env.WHATSAPP_APP_SECRET
  };
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_APP_SECRET = 'app-secret-ficticio';
  const middleware = loadMiddleware();
  const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(rawBody).digest('hex')}`;
  const req = { rawBody, get: () => signature };
  const res = mockResponse();
  let continued = false;
  middleware(req, res, () => { continued = true; });
  assert.equal(continued, true);

  const alteredReq = { rawBody: Buffer.from(`${rawBody.toString()} `), get: () => signature };
  const alteredRes = mockResponse();
  middleware(alteredReq, alteredRes, () => assert.fail('no debe continuar'));
  assert.equal(alteredRes.statusCode, 401);

  if (previous.enabled === undefined) delete process.env.WHATSAPP_ENABLED;
  else process.env.WHATSAPP_ENABLED = previous.enabled;
  if (previous.secret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = previous.secret;
});

test('rechaza integracion desactivada, firma ausente y rawBody ausente', () => {
  const previous = {
    enabled: process.env.WHATSAPP_ENABLED,
    secret: process.env.WHATSAPP_APP_SECRET
  };
  process.env.WHATSAPP_ENABLED = 'false';
  let middleware = loadMiddleware();
  let res = mockResponse();
  middleware({ get: () => undefined }, res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 503);

  process.env.WHATSAPP_ENABLED = 'true';
  process.env.WHATSAPP_APP_SECRET = 'app-secret-ficticio';
  middleware = loadMiddleware();
  res = mockResponse();
  middleware({ rawBody: Buffer.from('{}'), get: () => undefined }, res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 401);
  res = mockResponse();
  middleware({ get: () => 'sha256='.padEnd(71, '0') }, res, () => assert.fail('no debe continuar'));
  assert.equal(res.statusCode, 500);

  if (previous.enabled === undefined) delete process.env.WHATSAPP_ENABLED;
  else process.env.WHATSAPP_ENABLED = previous.enabled;
  if (previous.secret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = previous.secret;
});
