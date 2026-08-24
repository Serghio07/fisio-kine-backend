const test = require('node:test');
const assert = require('node:assert/strict');
const { getAllowedOrigins, validOrigin } = require('../src/config/cors');

test('desarrollo permite los puertos locales usados por Vite', () => {
  const origins = getAllowedOrigins({ NODE_ENV: 'development', CORS_ALLOWED_ORIGINS: '' });
  assert.equal(origins.includes('http://localhost:5173'), true);
  assert.equal(origins.includes('http://localhost:5175'), true);
  assert.equal(origins.includes('http://localhost:3001'), true);
  assert.equal(origins.includes('http://localhost:8081'), true);
});

test('producción no agrega orígenes locales implícitos', () => {
  const origins = getAllowedOrigins({ NODE_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://app.example.invalid' });
  assert.deepEqual(origins, ['https://app.example.invalid']);
});

test('produccion permite los dos dominios de la web publica cuando estan configurados', () => {
  const origins = getAllowedOrigins({
    NODE_ENV: 'production',
    CORS_ALLOWED_ORIGINS: 'https://physioactivefisioterapia.com,https://www.physioactivefisioterapia.com'
  });
  assert.deepEqual(origins, [
    'https://physioactivefisioterapia.com',
    'https://www.physioactivefisioterapia.com'
  ]);
});

test('validOrigin acepta orígenes HTTP y HTTPS válidos y rechaza valores inseguros', () => {
  assert.equal(validOrigin('http://localhost:5175'), true);
  assert.equal(validOrigin('https://sistema.physioactivefisioterapia.com'), true);
  assert.equal(validOrigin('javascript:alert(1)'), false);
  assert.equal(validOrigin('https://example.com/ruta'), false);
});
