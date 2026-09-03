const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildPaymentOperations, distributePayment, matchesPaymentPlan, withPeriodData } = require('../../src/controllers/planillaPagos.controller');
const { calculatePaymentState, validMoneyAmount } = require('../../src/services/paymentFinancialState.service');
const { validatePaymentOperation } = require('../../src/services/paymentOperationIntegrity.service');

const debts = [{ id: 22, saldo_pendiente: 20 }, { id: 23, saldo_pendiente: 5 }, { id: 24, saldo_pendiente: 10 }];

test('distribuye pago total FIFO 20/5/10', () => assert.deepEqual(distributePayment(debts, 35).map(x=>x.aplicado), [20,5,10]));
test('distribuye pago parcial FIFO 20/5/0', () => assert.deepEqual(distributePayment(debts, 25).map(x=>x.aplicado), [20,5,0]));
test('migración crea padre, FK nullable, índices y rollback protegido', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../migrations/20260825000100-create-operaciones-pago.js'),'utf8');
  assert.match(source,/createTable\('operaciones_pago'/); assert.match(source,/operacion_pago_id/); assert.match(source,/allowNull: true/);
  assert.match(source,/operaciones_pago_fecha_estado_idx/); assert.match(source,/existen operaciones de pago registradas/);
});
test('backend bloquea sobrepago incluso ADMIN y no suma operación padre en arqueo', () => {
  const controller=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');
  const arqueo=fs.readFileSync(path.join(__dirname,'../../src/services/arqueoCaja.service.js'),'utf8');
  assert.match(controller,/monto > actual\.saldo_pendiente\)/); assert.doesNotMatch(controller,/monto > actual\.saldo_pendiente && req\.usuario\.rol/);
  assert.doesNotMatch(arqueo,/OperacionPago/); assert.match(controller,/childTotal !== amount/);
});
test('operación global se anula completa y protege arqueo cerrado', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');
  assert.match(source,/MovimientoPago\.update\(\{ estado: 'Anulado'/); assert.match(source,/Reabra el arqueo antes de anularla/);
  assert.match(source,/transaction\.LOCK\.UPDATE/);
});
test('pagado acumulado considera únicamente movimientos activos', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');
  assert.match(source,/filter\(\(item\) => item\.estado === 'Activo'\)/);
});
test('concepto antiguo pagado hoy es visible y calcula pagado en período', () => {
  const item=withPeriodData({id:22,fecha_origen:'2026-08-21',total_pagado:100,movimientos:[{id:26,fecha:'2026-08-22',hora:'20:18:00',monto:20,metodo:'QR',estado:'Activo',usuario_receptor_id:1,recibido_por:{nombre:'Admin'}}]}, {desde:'2026-08-22',hasta:'2026-08-22'});
  assert.equal(item.visible_periodo,true);assert.equal(item.pagado_periodo,20);assert.equal(item.pagado_acumulado,100);assert.equal(item.ultimo_pago_periodo.id,26);
  assert.equal(matchesPaymentPlan({...item,paciente:{},historia_clinica:{},sesion:{}},{desde:'2026-08-22',hasta:'2026-08-22',metodo:'QR',receptor:'1'}),true);
  assert.equal(matchesPaymentPlan({...item,paciente:{},historia_clinica:{},sesion:{}},{desde:'2026-08-22',hasta:'2026-08-22',metodo:'Efectivo'}),false);
});
test('concepto sin actividad en el rango queda fuera y concepto creado en rango entra',()=>{
  assert.equal(withPeriodData({fecha_origen:'2026-08-21',total_pagado:10,movimientos:[{fecha:'2026-08-21',hora:'10:00',monto:10,estado:'Activo'}]},{desde:'2026-08-22',hasta:'2026-08-22'}).visible_periodo,false);
  assert.equal(withPeriodData({fecha_origen:'2026-08-22',total_pagado:0,movimientos:[]},{desde:'2026-08-22',hasta:'2026-08-22'}).visible_periodo,true);
});
test('pago global produce un recibo y comprobante padre sin duplicarse',()=>{
  const operation={id:1,fecha:'2026-08-22',hora:'20:18',monto_total:35,metodo:'QR',numero_recibo:'REC-1',numero_comprobante:'QR-1',estado:'ACTIVA',tipo:'DEUDA_HISTORIA'};
  const concepts=[20,5,10].map((monto,index)=>({id:22+index,paciente:{id:19},historia_clinica:{id:10},movimientos:[{id:26+index,fecha:'2026-08-22',hora:'20:18',monto,metodo:'QR',estado:'Activo',usuario_receptor_id:1,operacion_pago_id:1,operacion_pago:operation}]}));
  const rows=buildPaymentOperations(concepts,{desde:'2026-08-22',hasta:'2026-08-22'});assert.equal(rows.length,1);assert.equal(rows[0].aplicaciones.length,3);assert.equal(rows[0].numero_comprobante,'QR-1');
});
test('legacy conserva recibo y anulación individual; operaciones protegen hijos y arqueo cerrado',()=>{
  const rows=buildPaymentOperations([{id:24,paciente:{},historia_clinica:{},movimientos:[{id:25,fecha:'2026-08-22',hora:'10:00',monto:35,metodo:'Efectivo',estado:'Activo',numero_recibo:'REC-LEGACY'}]}],{desde:'2026-08-22',hasta:'2026-08-22'});
  assert.equal(rows[0].legacy,true);assert.equal(rows[0].movimiento_id,25);
  const source=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');assert.match(source,/no puede editarse por separado/);assert.match(source,/Reabra el arqueo antes de anularla/);assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'../../src/services/arqueoCaja.service.js'),'utf8'),/OperacionPago/);
});
test('exonerado tiene saldo y esperado cobrable cero sin importar monto nominal',()=>{
  assert.deepEqual(calculatePaymentState({activo:true,exonerado:true,monto_esperado:100},0),{estado:'Exonerado',pagado:0,saldo:0,esperado_cobrable:0});
});
test('reglas monetarias rechazan NaN, infinito, negativos y más de dos decimales',()=>{
  for(const value of [NaN,Infinity,-1,0,'1.001'])assert.equal(validMoneyAmount(value),false);assert.equal(validMoneyAmount('10.25'),true);
});
test('validador detecta suma, método, fecha y receptor inconsistentes',()=>{
  const valid={id:1,estado:'ACTIVA',monto_total:35,metodo:'QR',fecha:'2026-08-22',usuario_receptor_id:1,aplicaciones:[{id:1,estado:'Activo',monto:20,metodo:'QR',fecha:'2026-08-22',usuario_receptor_id:1,numero_recibo:null},{id:2,estado:'Activo',monto:15,metodo:'QR',fecha:'2026-08-22',usuario_receptor_id:1,numero_recibo:null}]};
  assert.equal(validatePaymentOperation(valid).valida,true);const invalid=structuredClone(valid);invalid.aplicaciones[1]={...invalid.aplicaciones[1],monto:5,metodo:'Efectivo',fecha:'2026-08-23',usuario_receptor_id:2};assert.equal(validatePaymentOperation(invalid).valida,false);assert.ok(validatePaymentOperation(invalid).errores.length>=4);
});
test('operación anulada exige todos los hijos anulados',()=>assert.equal(validatePaymentOperation({id:2,estado:'ANULADA',monto_total:10,metodo:'QR',fecha:'2026-08-22',usuario_receptor_id:1,aplicaciones:[{id:3,estado:'Activo',monto:10,metodo:'QR',fecha:'2026-08-22',usuario_receptor_id:1}]}).valida,false));
test('deuda de arqueo excluye exonerados y pagos validan receptor y fecha futura',()=>{
  const arqueo=fs.readFileSync(path.join(__dirname,'../../src/services/arqueoCaja.service.js'),'utf8');const controller=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');
  assert.match(arqueo,/c\.exonerado = FALSE/);assert.match(controller,/No se pueden registrar pagos con fecha futura/);assert.match(controller,/usuario receptor no existe o no está activo/);
});

test('pago especifico registra una actividad completa para no revertir la transaccion',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../src/controllers/planillaPagos.controller.js'),'utf8');
  assert.match(source,/entidad_id: operacion\.id,[\s\S]*fecha: today\(\), hora: nowTime\(\), modulo: 'Control financiero', accion: 'OPERACION_PAGO_CREADA'/);
});

test('editar una sesion pagada sincroniza su movimiento sin duplicarlo',()=>{
  const controller=fs.readFileSync(path.join(__dirname,'../../src/controllers/sesion.controller.js'),'utf8');
  const sync=fs.readFileSync(path.join(__dirname,'../../src/services/planillaPagosSync.service.js'),'utf8');
  assert.match(controller,/sincronizarConceptoSesion\(sesion, transaction, \{ importarPago: true \}\)/);
  assert.match(sync,/numero_recibo: receipt[\s\S]*const paymentChanged/);
  assert.match(sync,/monto: desiredAmount, metodo: desiredMethod/);
  assert.match(sync,/arqueo\?\.estado === 'Cerrado'[\s\S]*Reabra el arqueo/);
  assert.match(sync,/if \(created \|\| importarPago\) await syncSessionPayment/);
});
