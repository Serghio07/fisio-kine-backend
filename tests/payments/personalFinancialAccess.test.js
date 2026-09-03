const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../../src/models');
const { sanearEntradaSesionConPago } = require('../../src/middlewares/financialAccess.middleware');
const { effectivePermissions } = require('../../src/services/rolePermission.service');

test('PERSONAL conserva el pago permitido al registrar una sesión', () => {
  const req = {
    user: { id: 9, rol: 'personal' },
    body: {
      paciente_id: 4,
      procedimiento: 'Fisioterapia',
      metodo_pago: 'QR',
      estado_pago: 'Parcial',
      monto_sesion: 200,
      monto_pagado: 80,
      saldo_pendiente: 120,
      total_facturado: 999
    }
  };
  let continued = false;
  sanearEntradaSesionConPago(req, {}, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.body.metodo_pago, 'QR');
  assert.equal(req.body.monto_pagado, 80);
  assert.equal(req.body.saldo_pendiente, 120);
  assert.equal(req.body.procedimiento, 'Fisioterapia');
  assert.equal(Object.hasOwn(req.body, 'total_facturado'), false);
});

test('PERSONAL siempre puede consultar y registrar pagos sin permiso de anulación', async () => {
  const originalFindAll = models.RolPermiso.findAll;
  models.RolPermiso.findAll = async () => [{ modulo: 'finanzas', acciones: [] }];
  try {
    const permissions = await effectivePermissions('personal');
    assert.deepEqual(permissions.finanzas.sort(), ['create', 'edit', 'export', 'print', 'view']);
    assert.equal(permissions.finanzas.includes('annul'), false);
    assert.equal(permissions.finanzas.includes('administer'), false);
  } finally {
    models.RolPermiso.findAll = originalFindAll;
  }
});
