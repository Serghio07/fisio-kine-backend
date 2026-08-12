const test = require('node:test');
const assert = require('node:assert/strict');

const googleCalendar = require('../src/services/googleCalendarService');
const controller = require('../src/controllers/googleCalendar.controller');

const mockResponse = () => {
  const response = { statusCode: 200, body: undefined, redirectedTo: undefined };
  response.status = function status(code) { this.statusCode = code; return this; };
  response.json = function json(body) { this.body = body; return this; };
  response.send = function send(body) { this.body = body; return this; };
  response.type = function type() { return this; };
  response.redirect = function redirect(url) { this.redirectedTo = url; return this; };
  return response;
};

test('auth devuelve authUrl sin redireccionar al navegador', async () => {
  const previous = googleCalendar.generateAuthUrl;
  googleCalendar.generateAuthUrl = (state) => `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(state)}`;

  const response = mockResponse();
  controller.auth({ usuario: { id: 11 } }, response, () => assert.fail('no debe llamar next'));

  assert.equal(typeof response.body.authUrl, 'string');
  assert.match(response.body.authUrl, /state=/);

  googleCalendar.generateAuthUrl = previous;
});

test('callback con state invalido rechaza la solicitud', async () => {
  const previous = googleCalendar.exchangeCodeForTokens;
  const response = mockResponse();

  await controller.callback({ query: { code: 'code-falso', state: 'invalido' } }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /Solicitud invalida/);
  assert.equal(response.redirectedTo, undefined);

  googleCalendar.exchangeCodeForTokens = previous;
});

test('callback valido guarda tokens y redirige al frontend', async () => {
  const previous = {
    exchangeCodeForTokens: googleCalendar.exchangeCodeForTokens,
    saveTokens: googleCalendar.saveTokens,
    frontendUrl: process.env.FRONTEND_URL,
    jwtSecret: process.env.JWT_SECRET
  };

  process.env.FRONTEND_URL = 'https://sistema.physioactivefisioterapia.com';
  process.env.JWT_SECRET = 'jwt-secret-ficticio-para-google-calendar-123456789';

  const state = controller.createState(7);
  let savedTokens;
  googleCalendar.exchangeCodeForTokens = async (code) => {
    assert.equal(code, 'codigo-falso');
    return { access_token: 'access-falso', refresh_token: 'refresh-falso', expiry_date: 123 };
  };
  googleCalendar.saveTokens = async (tokens) => { savedTokens = tokens; };

  const response = mockResponse();
  await controller.callback({ query: { code: 'codigo-falso', state } }, response);

  assert.equal(savedTokens.refresh_token, 'refresh-falso');
  assert.equal(response.statusCode, 200);
  assert.equal(response.redirectedTo, 'https://sistema.physioactivefisioterapia.com/integraciones?google=connected');

  googleCalendar.exchangeCodeForTokens = previous.exchangeCodeForTokens;
  googleCalendar.saveTokens = previous.saveTokens;
  if (previous.frontendUrl === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = previous.frontendUrl;
  if (previous.jwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previous.jwtSecret;
});

test('status y disconnect delegan al servicio', async () => {
  const previous = {
    getConnectionStatus: googleCalendar.getConnectionStatus,
    disconnect: googleCalendar.disconnect
  };

  googleCalendar.getConnectionStatus = async () => ({ connected: true, calendarId: 'primary' });
  googleCalendar.disconnect = async () => ({ disconnected: true });

  const statusResponse = mockResponse();
  await controller.status({}, statusResponse);
  assert.deepEqual(statusResponse.body, { connected: true, calendarId: 'primary' });

  const disconnectResponse = mockResponse();
  await controller.disconnect({}, disconnectResponse);
  assert.deepEqual(disconnectResponse.body, { connected: false, disconnected: true });

  googleCalendar.getConnectionStatus = previous.getConnectionStatus;
  googleCalendar.disconnect = previous.disconnect;
});