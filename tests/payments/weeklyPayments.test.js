const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { agregarPagosSemana } = require('../../src/controllers/registroSemanal.controller');

test('asigna el pago semanal por paciente e historia sin duplicarlo', () => {
  const rows = agregarPagosSemana([
    { paciente_id: 19, historia_clinica_id: 10 },
    { paciente_id: 19, historia_clinica_id: 11 },
    { paciente_id: 20, historia_clinica_id: 10 }
  ], [
    { paciente_id: 19, historia_clinica_id: 10, pagado_en_semana: '145.00' },
    { paciente_id: 19, historia_clinica_id: 11, pagado_en_semana: '50.00' }
  ]);

  assert.deepEqual(rows.map((row) => row.pagado_en_semana), [145, 50, 0]);
});

test('la consulta usa movimientos activos, fecha de pago e historia no nula', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/controllers/registroSemanal.controller.js'), 'utf8');
  assert.match(source, /m\.estado = 'Activo'/);
  assert.match(source, /m\.fecha BETWEEN :fechaInicio AND :fechaFin/);
  assert.match(source, /c\.activo = TRUE/);
  assert.match(source, /c\.historia_clinica_id IS NOT NULL/);
  assert.doesNotMatch(source, /SUM\([^)]*monto_pagado/);
});

test('el filtro financiero reconoce pagado_en_semana', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../src/middlewares/financialAccess.middleware.js'), 'utf8');
  assert.match(source, /'pagado_en_semana'/);
});
