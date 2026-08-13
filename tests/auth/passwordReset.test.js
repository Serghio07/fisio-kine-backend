const assert = require('node:assert/strict');
const test = require('node:test');

const sequelize = require('../../src/config/database');
const models = require('../../src/models');
const emailService = require('../../src/services/email.service');
const passwordResetService = require('../../src/services/passwordReset.service');
const authController = require('../../src/controllers/auth.controller');

const response = () => ({
  statusCode: 200,
  body: undefined,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

test('solicitud guarda solo el hash y una expiracion de 60 minutos', async () => {
  const originalFindOne = models.Usuario.findOne;
  let updatePayload;
  let sentToken;
  const before = Date.now();
  models.Usuario.findOne = async () => ({
    id: 8,
    email: 'persona@example.com',
    update: async (payload) => { updatePayload = payload; }
  });

  try {
    await passwordResetService.requestPasswordReset(' PERSONA@example.com ', {
      sendEmail: async (to, token) => {
        assert.equal(to, 'persona@example.com');
        sentToken = token;
      }
    });
    assert.equal(updatePayload.reset_password_token_hash, passwordResetService.hashToken(sentToken));
    assert.notEqual(updatePayload.reset_password_token_hash, sentToken);
    assert.ok(updatePayload.reset_password_expires_at.getTime() >= before + passwordResetService.TOKEN_DURATION_MS);
    assert.ok(updatePayload.reset_password_expires_at.getTime() <= Date.now() + passwordResetService.TOKEN_DURATION_MS);
  } finally {
    models.Usuario.findOne = originalFindOne;
  }
});

test('correo inexistente no intenta enviar un mensaje', async () => {
  const originalFindOne = models.Usuario.findOne;
  models.Usuario.findOne = async () => null;
  let sent = false;
  try {
    await passwordResetService.requestPasswordReset('nadie@example.com', {
      sendEmail: async () => { sent = true; }
    });
    assert.equal(sent, false);
  } finally {
    models.Usuario.findOne = originalFindOne;
  }
});

test('una falla SMTP elimina el token que no pudo entregarse', async () => {
  const originalFindOne = models.Usuario.findOne;
  const originalUpdate = models.Usuario.update;
  let cleanup;
  models.Usuario.findOne = async () => ({ id: 9, email: 'persona@example.com', update: async () => {} });
  models.Usuario.update = async (payload, options) => { cleanup = { payload, options }; };
  try {
    await assert.rejects(
      passwordResetService.requestPasswordReset('persona@example.com', {
        sendEmail: async () => { throw new Error('SMTP offline'); }
      }),
      /SMTP offline/
    );
    assert.deepEqual(cleanup.payload, {
      reset_password_token_hash: null,
      reset_password_expires_at: null
    });
    assert.equal(cleanup.options.where.id, 9);
  } finally {
    models.Usuario.findOne = originalFindOne;
    models.Usuario.update = originalUpdate;
  }
});

test('restablecimiento consume el token y delega el hash de contrasena al modelo', async () => {
  const originalTransaction = sequelize.transaction;
  const originalFindOne = models.Usuario.findOne;
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  let saved = false;
  const usuario = {
    password: 'anterior',
    reset_password_token_hash: 'hash',
    reset_password_expires_at: new Date(),
    intentos_fallidos: 2,
    bloqueado_hasta: new Date(),
    save: async (options) => { assert.equal(options.transaction, transaction); saved = true; }
  };
  sequelize.transaction = async (callback) => callback(transaction);
  models.Usuario.findOne = async (options) => {
    assert.equal(options.where.reset_password_token_hash, passwordResetService.hashToken('token-valido'));
    assert.equal(options.lock, 'UPDATE');
    return usuario;
  };
  try {
    assert.equal(await passwordResetService.resetPassword('token-valido', 'NuevaClave1'), true);
    assert.equal(usuario.password, 'NuevaClave1');
    assert.equal(usuario.reset_password_token_hash, null);
    assert.equal(usuario.reset_password_expires_at, null);
    assert.equal(usuario.intentos_fallidos, 0);
    assert.equal(usuario.bloqueado_hasta, null);
    assert.equal(saved, true);
  } finally {
    sequelize.transaction = originalTransaction;
    models.Usuario.findOne = originalFindOne;
  }
});

test('token invalido, expirado o ya usado produce el mismo resultado', async () => {
  const originalTransaction = sequelize.transaction;
  const originalFindOne = models.Usuario.findOne;
  sequelize.transaction = async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } });
  models.Usuario.findOne = async () => null;
  try {
    assert.equal(await passwordResetService.resetPassword('no-valido', 'NuevaClave1'), false);
  } finally {
    sequelize.transaction = originalTransaction;
    models.Usuario.findOne = originalFindOne;
  }
});

test('forgot-password responde igual para cualquier resultado interno', async () => {
  const originalRequest = passwordResetService.requestPasswordReset;
  try {
    passwordResetService.requestPasswordReset = async () => {};
    const success = response();
    await authController.forgotPassword({ body: { email: 'persona@example.com' } }, success);

    passwordResetService.requestPasswordReset = async () => { throw new Error('interno'); };
    const failure = response();
    await authController.forgotPassword({ body: { email: 'nadie@example.com' } }, failure);

    assert.equal(success.statusCode, 200);
    assert.deepEqual(success.body, failure.body);
    assert.equal(success.body.message, authController.FORGOT_PASSWORD_MESSAGE);
  } finally {
    passwordResetService.requestPasswordReset = originalRequest;
  }
});

test('el enlace de correo usa FRONTEND_RESET_URL y codifica el token', () => {
  const previous = process.env.FRONTEND_RESET_URL;
  process.env.FRONTEND_RESET_URL = 'http://localhost:5173/reset-password?origen=login';
  try {
    const link = new URL(emailService.buildResetLink('token con + simbolos'));
    assert.equal(link.origin, 'http://localhost:5173');
    assert.equal(link.pathname, '/reset-password');
    assert.equal(link.searchParams.get('origen'), 'login');
    assert.equal(link.searchParams.get('token'), 'token con + simbolos');
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_RESET_URL;
    else process.env.FRONTEND_RESET_URL = previous;
  }
});

test('el enlace movil usa MOBILE_RESET_URL para abrir la app', () => {
  const originalMobileUrl = process.env.MOBILE_RESET_URL;
  process.env.MOBILE_RESET_URL = 'physioactive://reset-password';
  try {
    const link = new URL(emailService.buildResetLink('token movil', 'mobile'));
    assert.equal(link.protocol, 'physioactive:');
    assert.equal(link.hostname, 'reset-password');
    assert.equal(link.searchParams.get('token'), 'token movil');
  } finally {
    if (originalMobileUrl === undefined) delete process.env.MOBILE_RESET_URL;
    else process.env.MOBILE_RESET_URL = originalMobileUrl;
  }
});
