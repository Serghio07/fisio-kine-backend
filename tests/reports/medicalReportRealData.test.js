const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const controller = readFileSync(resolve(__dirname, '../../src/controllers/informeMedico.controller.js'), 'utf8');

test('backend calcula sesiones realizadas y no confía en el contador del cliente', () => {
  assert.match(controller, /Sesion\.count/);
  assert.match(controller, /asistencia: 'asistio'/);
  assert.match(controller, /anulada: false/);
  assert.match(controller, /cantidad_sesiones: cantidadSesiones/);
  assert.match(controller, /payload\.cantidad_sesiones = cantidadSesiones/);
});
