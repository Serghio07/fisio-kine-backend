const assert = require('node:assert/strict');
const test = require('node:test');

const models = require('../../src/models');
const googleCalendar = require('../../src/services/googleCalendarService');
const controller = require('../../src/controllers/googleCalendar.controller');

const response = () => ({
  statusCode: 200,
  body: undefined,
  redirectedTo: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
  type() { return this; },
  send(body) { this.body = body; return this; },
  redirect(url) { this.redirectedTo = url; return this; }
});

test('Google auth devuelve una URL y no redirige directamente', () => {
  const original = googleCalendar.generateAuthUrl;
  googleCalendar.generateAuthUrl = (state) => `https://accounts.google.test/oauth?state=${encodeURIComponent(state)}`;
  try {
    const res = response();
    controller.auth({ usuario: { id: 7 } }, res, (error) => { throw error; });
    assert.match(res.body.authUrl, /^https:\/\/accounts\.google\.test\/oauth/);
    assert.equal(res.redirectedTo, null);
    assert.deepEqual(Object.keys(res.body), ['authUrl']);
  } finally { googleCalendar.generateAuthUrl = original; }
});

test('state de Google esta firmado, expira y conserva el usuario', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  try {
    const state = controller.createState(15);
    assert.equal(controller.readState(state).userId, 15);
    assert.equal(controller.readState(`${state}alterado`), null);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('callback rechaza state asociado a usuario que ya no es ADMIN activo', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const originalFind = models.Usuario.findByPk;
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  models.Usuario.findByPk = async () => ({ rol: 'personal', estado: 'activo', activo: true });
  try {
    const res = response();
    await controller.callback({ query: { code: 'code', state: controller.createState(4) } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.body, /Autorizacion rechazada/);
  } finally {
    models.Usuario.findByPk = originalFind;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test('status devuelve solamente informacion segura del servicio', async () => {
  const original = googleCalendar.getConnectionStatus;
  googleCalendar.getConnectionStatus = async () => ({ connected: true, calendarId: 'primary', connectedAt: null });
  try {
    const res = response();
    await controller.status({}, res, (error) => { throw error; });
    assert.deepEqual(res.body, { connected: true, calendarId: 'primary', connectedAt: null });
    assert.doesNotMatch(JSON.stringify(res.body), /token|secret/i);
  } finally { googleCalendar.getConnectionStatus = original; }
});

test('disconnect conserva respuesta local coherente aunque la revocacion falle', async () => {
  const original = googleCalendar.disconnect;
  googleCalendar.disconnect = async () => ({ disconnected: true, revocation: 'FAILED' });
  try {
    const res = response();
    await controller.disconnect({}, res, (error) => { throw error; });
    assert.deepEqual(res.body, { disconnected: true, revocation: 'FAILED' });
  } finally { googleCalendar.disconnect = original; }
});

test('callback exitoso vuelve a Integraciones sin exponer tokens', async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousFrontend = process.env.FRONTEND_URL;
  const originalFind = models.Usuario.findByPk;
  const originalExchange = googleCalendar.exchangeCodeForTokens;
  const originalSave = googleCalendar.saveTokens;
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  process.env.FRONTEND_URL = 'https://sistema.example.com';
  models.Usuario.findByPk = async () => ({ rol: 'admin', estado: 'activo', activo: true });
  googleCalendar.exchangeCodeForTokens = async () => ({ refresh_token: 'sensible' });
  googleCalendar.saveTokens = async () => {};
  try {
    const res = response();
    await controller.callback({ query: { code: 'code', state: controller.createState(1) } }, res);
    assert.equal(res.redirectedTo, 'https://sistema.example.com/integraciones?google=connected');
    assert.doesNotMatch(res.redirectedTo, /sensible/);
  } finally {
    models.Usuario.findByPk = originalFind;
    googleCalendar.exchangeCodeForTokens = originalExchange;
    googleCalendar.saveTokens = originalSave;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
    if (previousFrontend === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = previousFrontend;
  }
});
