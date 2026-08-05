const test = require('node:test');
const assert = require('node:assert/strict');
const { sendTextMessage } = require('../../src/services/whatsapp.service');

const config = {
  enabled: true,
  accessToken: 'token-ficticio',
  phoneNumberId: '1250927094765899',
  apiVersion: 'v26.0'
};

test('envia el body esperado y normaliza una respuesta exitosa', async () => {
  let request;
  const result = await sendTextMessage('59160000000', 'Hola', {
    config,
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 200,
        json: async () => ({ messaging_product: 'whatsapp', messages: [{ id: 'wamid.salida' }] })
      };
    }
  });
  assert.equal(result.success, true);
  assert.equal(result.messageId, 'wamid.salida');
  assert.equal(request.url, 'https://graph.facebook.com/v26.0/1250927094765899/messages');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '59160000000',
    type: 'text',
    text: { preview_url: false, body: 'Hola' }
  });
  assert.equal(request.options.headers.Authorization, 'Bearer token-ficticio');
});

test('captura errores 401 y 500 sin lanzar ni exponer Authorization', async () => {
  for (const status of [401, 500]) {
    const result = await sendTextMessage('59160000000', 'Hola', {
      config,
      fetchImplementation: async () => ({
        ok: false,
        status,
        json: async () => ({ error: { code: status === 401 ? 190 : 2, message: `Meta error ${status}`, type: 'OAuthException' } })
      })
    });
    assert.equal(result.success, false);
    assert.equal(result.status, status);
    assert.equal(JSON.stringify(result).includes('token-ficticio'), false);
  }
});

test('reporta configuracion faltante sin realizar HTTP', async () => {
  let called = false;
  const result = await sendTextMessage('59160000000', 'Hola', {
    config: { enabled: true, accessToken: '', phoneNumberId: '', apiVersion: '' },
    fetchImplementation: async () => { called = true; }
  });
  assert.equal(result.success, false);
  assert.equal(result.code, 'CONFIGURATION_ERROR');
  assert.equal(called, false);
  assert.match(result.message, /WHATSAPP_ACCESS_TOKEN/);
  assert.match(result.message, /WHATSAPP_PHONE_NUMBER_ID/);
});

test('maneja timeout y error de red sin lanzar', async () => {
  const timeoutResult = await sendTextMessage('59160000000', 'Hola', {
    config,
    timeoutMs: 5,
    fetchImplementation: (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('abortado');
        error.name = 'AbortError';
        reject(error);
      });
    })
  });
  assert.equal(timeoutResult.code, 'TIMEOUT');

  const networkResult = await sendTextMessage('59160000000', 'Hola', {
    config,
    fetchImplementation: async () => { throw new Error('red'); }
  });
  assert.equal(networkResult.code, 'NETWORK_ERROR');
});
