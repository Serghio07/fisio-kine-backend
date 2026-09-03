const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sequelize } = require('../../src/models');
const { resolvePeriod, variation, reportPaymentState, periodObligations, aggregatePeriod, dailyClosing, consolidated } = require('../../src/services/financialConsolidation.service');

test('día usa una sola fecha y compara contra el día anterior', () => {
  assert.deepEqual(resolvePeriod({ tipo:'dia', fecha:'2026-08-23' }), { tipo:'dia', desde:'2026-08-23', hasta:'2026-08-23', etiqueta:'Día 2026-08-23', anterior_desde:'2026-08-22', anterior_hasta:'2026-08-22' });
});

test('arqueo diario prioriza snapshot cerrado y fecha_operativa no nula', async () => {
  const original=sequelize.query;sequelize.query=async(sql,options)=>{assert.match(sql,/fecha_operativa=:date/);assert.match(sql,/a\.estado='Cerrado'/);assert.equal(options.replacements.date,'2026-08-23');return {estado:'Cerrado',resultado_cierre:'CON_DIFERENCIA',responsable_nombre:'Actual',saldo_inicial_efectivo:10,efectivo_sistema:100,efectivo_contado:95,diferencia:0,monto_retirado:50,saldo_dejado_caja:45,snapshot_resumen:{responsable_nombre_snapshot:'Congelado',sistemas:{Efectivo:110,QR:20},confirmados:{Efectivo:105,QR:20},diferencias:{Efectivo:-5,QR:0},diferencia_total:-5,monto_retirado:60,saldo_dejado_caja:45,resultado:'CON_DIFERENCIA'}}};
  try{const result=await dailyClosing('2026-08-23');assert.equal(result.estado,'Cerrado — Con diferencia');assert.equal(result.responsable,'Congelado');assert.equal(result.sistema.efectivo,110);assert.equal(result.confirmado.efectivo,105);assert.equal(result.diferencias.total,-5);assert.equal(result.monto_retirado,60)}finally{sequelize.query=original}
});

test('fixture diario calcula 2 pacientes, 3 sesiones y resultado operativo 140', async () => {
  const original=sequelize.query;sequelize.query=async(sql)=>{
    if(sql.includes('COUNT(DISTINCT paciente_id)'))return {pacientes_atendidos:2,sesiones_realizadas:3};
    if(sql.includes('FROM movimientos_pago m JOIN'))return {total_cobrado:150,efectivo:100,qr:50,transferencia:0,tarjeta:0,otro:0,fisioterapia:150,otros_servicios:0};
    if(sql.includes('FROM conceptos_cobro c LEFT JOIN'))return {deuda_vigente_actual:25,deuda_originada_periodo:10};
    if(sql.includes('SELECT tipo_movimiento'))return [{tipo_movimiento:'INGRESO_EXTRAORDINARIO',categoria:null,monto:20},{tipo_movimiento:'EGRESO',categoria:'INSUMOS',monto:30},{tipo_movimiento:'APORTE_CAJA',categoria:null,monto:500},{tipo_movimiento:'RETIRO_CAJA',categoria:null,monto:200}];
    if(sql.includes('FROM arqueos_pago'))return {cantidad_cierres:0,cuadrados:0,con_diferencia:0,diferencias:0};
    if(sql.includes('COUNT(DISTINCT fecha)'))return {dias:1};throw new Error(`Consulta inesperada: ${sql}`);
  };
  try{const result=await aggregatePeriod('2026-08-23','2026-08-23');assert.deepEqual(result.actividad_clinica,{pacientes_atendidos:2,sesiones_realizadas:3});assert.equal(result.cobros.total_cobrado,150);assert.equal(result.cobros.efectivo,100);assert.equal(result.cobros.qr,50);assert.equal(result.resultado.total_ingresos_operativos,170);assert.equal(result.resultado.total_egresos_operativos,30);assert.equal(result.resultado.resultado_neto_operativo,140);assert.equal(result.caja.aportes,500);assert.equal(result.caja.retiros,200)}finally{sequelize.query=original}
});

test('semana usa lunes-domingo incluso cuando cruza de mes', () => {
  assert.deepEqual(resolvePeriod({ tipo:'semana', fechaReferencia:'2026-07-01' }), { tipo:'semana', desde:'2026-06-29', hasta:'2026-07-05', etiqueta:'Semana del 2026-06-29 al 2026-07-05', anterior_desde:'2026-06-22', anterior_hasta:'2026-06-28' });
});

test('mes anterior cruza correctamente de enero al diciembre previo', () => {
  const january=resolvePeriod({tipo:'mes',fechaReferencia:'2026-01-15'});assert.equal(january.desde,'2026-01-01');assert.equal(january.hasta,'2026-01-31');assert.equal(january.anterior_desde,'2025-12-01');assert.equal(january.anterior_hasta,'2025-12-31');
  const december=resolvePeriod({tipo:'mes',fechaReferencia:'2026-12-10'});assert.equal(december.anterior_desde,'2026-11-01');assert.equal(december.anterior_hasta,'2026-11-30');
});

test('variación protege división por cero sin Infinity', () => {
  assert.deepEqual(variation(100,0),{actual:100,anterior:0,diferencia:100,variacion_porcentaje:null,direccion:'nuevo',etiqueta:'Nueva actividad'});
  assert.equal(variation(0,0).variacion_porcentaje,0);assert.equal(variation(110,100).variacion_porcentaje,10);
});

test('fixture semanal calcula actividad, métodos, caja y resultado sin contar aportes ni retiros', async () => {
  const original=sequelize.query;
  sequelize.query=async(sql,{replacements})=>{
    const current=replacements.from==='2026-08-17';
    if(sql.includes('c.id AS concepto_id'))return [];
    if(sql.includes('SELECT m.id,m.fecha'))return [];
    if(sql.includes('SELECT id,fecha,hora,concepto'))return [];
    if(sql.includes('SELECT p.id AS paciente_id'))return [];
    if(sql.includes('FROM generate_series'))return [];
    if(sql.includes('COUNT(DISTINCT paciente_id)'))return current?{pacientes_atendidos:3,sesiones_realizadas:5}:{pacientes_atendidos:0,sesiones_realizadas:0};
    if(sql.includes('FROM movimientos_pago m JOIN'))return current?{total_cobrado:500,efectivo:100,qr:200,transferencia:50,tarjeta:150,otro:0,fisioterapia:450,otros_servicios:50}:{total_cobrado:0,efectivo:0,qr:0,transferencia:0,tarjeta:0,otro:0,fisioterapia:0,otros_servicios:0};
    if(sql.includes('FROM conceptos_cobro c LEFT JOIN'))return {deuda_vigente_actual:30,deuda_originada_periodo:current?20:10};
    if(sql.includes('SELECT tipo_movimiento'))return current?[{tipo_movimiento:'INGRESO_EXTRAORDINARIO',categoria:null,monto:100},{tipo_movimiento:'EGRESO',categoria:'INSUMOS',monto:120},{tipo_movimiento:'EGRESO',categoria:'PERSONAL',monto:80},{tipo_movimiento:'APORTE_CAJA',categoria:null,monto:900},{tipo_movimiento:'RETIRO_CAJA',categoria:null,monto:700}]:[];
    if(sql.includes("FROM arqueos_pago"))return {cantidad_cierres:0,cuadrados:0,con_diferencia:0,diferencias:0};
    if(sql.includes('COUNT(DISTINCT fecha)'))return {dias:current?3:0};
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  try{
    const result=await consolidated({tipo:'semana',fechaReferencia:'2026-08-22'});
    assert.deepEqual(result.actividad_clinica,{pacientes_atendidos:3,sesiones_realizadas:5});
    assert.deepEqual(result.cobros,{total_cobrado:500,efectivo:100,qr:200,transferencia:50,qr_transferencia_total:250,tarjeta:150,otro:0});
    assert.equal(result.caja.ingresos_extraordinarios,100);assert.equal(result.caja.egresos_operativos,200);assert.equal(result.resultado.total_ingresos_operativos,600);assert.equal(result.resultado.resultado_neto_operativo,400);
    assert.equal(result.gastos_resumen.administrativos,80);assert.equal(result.gastos_resumen.insumos,120);assert.equal(result.cierres_diarios.estado,'Período con actividad financiera sin cierres diarios completos');
    assert.equal(result.comparacion.metricas.total_cobrado.etiqueta,'Nueva actividad');
  }finally{sequelize.query=original}
});

test('estados de reporte no cambian los estados financieros internos', () => {
  assert.equal(reportPaymentState({estado:'Pagado',monto_esperado:200,monto_pagado:200}),'CANCELADO');
  assert.equal(reportPaymentState({estado:'Parcial',monto_esperado:200,monto_pagado:100}),'PENDIENTE');
  assert.equal(reportPaymentState({estado:'Pendiente',monto_esperado:200,monto_pagado:0}),'NO CANCELADO');
  assert.equal(reportPaymentState({estado:'Exonerado',exonerado:true,monto_esperado:200,monto_pagado:0}),'EXONERADO');
  assert.equal(reportPaymentState({estado:'Anulado',activo:false,monto_esperado:200,monto_pagado:0}),'ANULADO');
  assert.equal(reportPaymentState({estado:'Saldo a favor',monto_esperado:200,monto_pagado:220}),'SALDO A FAVOR');
});

test('detalle de obligaciones devuelve una fila por concepto con pagos y recibos agregados', async () => {
  const original=sequelize.query;let sqlSeen;let replacementsSeen;
  sequelize.query=async(sql,{replacements})=>{sqlSeen=sql;replacementsSeen=replacements;return [
    {concepto_id:1,fecha:'2026-08-10',paciente_id:7,paciente:'ANA PEREZ',documento:'123',historia_id:4,sesion_id:11,profesional:'FT A',monto_esperado:200,monto_pagado:200,saldo_pendiente:0,metodos_pago:['Efectivo'],recibos:['REC-1'],estado_interno:'Pagado',exonerado:false,activo:true,fecha_ultimo_pago:'2026-08-10'},
    {concepto_id:2,fecha:'2026-08-10',paciente_id:7,paciente:'ANA PEREZ',documento:'123',historia_id:4,sesion_id:12,profesional:'FT A',monto_esperado:200,monto_pagado:0,saldo_pendiente:200,metodos_pago:[],recibos:[],estado_interno:'Pendiente',exonerado:false,activo:true,fecha_ultimo_pago:null},
    {concepto_id:3,fecha:'2026-08-10',paciente_id:8,paciente:'LUIS ROJAS',documento:'456',historia_id:5,sesion_id:13,profesional:'FT B',monto_esperado:200,monto_pagado:100,saldo_pendiente:100,metodos_pago:['Efectivo','QR'],recibos:['REC-2','REC-3'],estado_interno:'Parcial',exonerado:false,activo:true,fecha_ultimo_pago:'2026-08-12'},
    {concepto_id:4,fecha:'2026-08-11',paciente_id:9,paciente:'MARIA LOPEZ',documento:'789',historia_id:null,sesion_id:null,profesional:'ADMIN',monto_esperado:50,monto_pagado:0,saldo_pendiente:50,metodos_pago:[],recibos:[],estado_interno:'Pendiente',exonerado:false,activo:true,fecha_ultimo_pago:null},
    {concepto_id:5,fecha:'2026-08-11',paciente_id:10,paciente:'JOSE DIAZ',documento:'987',historia_id:6,sesion_id:14,profesional:'FT C',monto_esperado:80,monto_pagado:0,saldo_pendiente:80,metodos_pago:[],recibos:[],estado_interno:'Exonerado',exonerado:true,activo:true,fecha_ultimo_pago:null},
    {concepto_id:6,fecha:'2026-08-20',paciente_id:7,paciente:'ANA PEREZ',documento:'123',historia_id:4,sesion_id:9,profesional:'FT A',monto_esperado:500,monto_pagado:250,monto_pagado_acumulado:500,saldo_pendiente:0,metodos_pago:['Efectivo'],recibos:['REC-HOY'],estado_interno:'Pagado',exonerado:false,activo:true,originado_periodo:false,fecha_ultimo_pago:'2026-08-20'}
  ]};
  try{
    const result=await periodObligations('2026-08-01','2026-08-31');
    assert.equal(result.detalle.length,6);assert.equal(new Set(result.detalle.map(row=>row.conceptoId)).size,6);
    assert.equal(result.detalle[0].estadoReporte,'CANCELADO');assert.equal(result.detalle[1].estadoReporte,'NO CANCELADO');assert.equal(result.detalle[2].estadoReporte,'PENDIENTE');
    assert.deepEqual(result.detalle[2].recibos,['REC-2','REC-3']);assert.deepEqual(result.detalle[2].metodosPago,['Efectivo','QR']);
    assert.equal(result.detalle[3].sesionId,null);assert.equal(result.detalle[4].estadoReporte,'EXONERADO');
    assert.equal(result.detalle[5].montoPagado,250);assert.equal(result.detalle[5].monto_pagado_acumulado,500);assert.equal(result.detalle[5].estadoReporte,'CANCELADO');
    assert.deepEqual(result.totales,{total_obligaciones_periodo:650,total_cobrado_sobre_obligaciones_periodo:300,total_pendiente_periodo:350,cantidad_obligaciones:4});
    assert.deepEqual(replacementsSeen,{from:'2026-08-01',to:'2026-08-31'});
    assert.match(sqlSeen,/FROM conceptos_cobro c/);assert.match(sqlSeen,/LEFT JOIN LATERAL/);assert.match(sqlSeen,/SUM\(m\.monto\)/);assert.match(sqlSeen,/ARRAY_AGG\(DISTINCT/);
  }finally{sequelize.query=original}
});

test('obligaciones protegen periodo, anulados, sesiones anuladas/no asistidas y permiten concepto manual',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../src/services/financialConsolidation.service.js'),'utf8');
  assert.match(source,/c\.fecha_origen BETWEEN :from AND :to OR COALESCE\(pay\.monto_pagado_periodo,0\)>0/);assert.match(source,/c\.activo=TRUE/);assert.match(source,/c\.estado<>'Anulado'/);assert.match(source,/c\.monto_esperado>0/);
  assert.match(source,/SUM\(m\.monto\) FILTER \(WHERE m\.fecha BETWEEN :from AND :to\) AS monto_pagado_periodo/);
  assert.match(source,/c\.sesion_id IS NULL OR \(s\.anulada=FALSE AND s\.asistencia='asistio'\)/);
  assert.match(source,/WHERE m\.concepto_cobro_id=c\.id AND m\.estado='Activo'/);
});

test('detalle diario identifica al usuario real que recibió cada pago',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../src/services/financialConsolidation.service.js'),'utf8');
  assert.match(source,/COALESCE\(ur\.nombre,'Sin registrar'\) AS recibido_por,[\s\S]*FROM movimientos_pago m[\s\S]*LEFT JOIN usuarios ur ON ur\.id=m\.usuario_receptor_id/);
  const obligationsSql=source.slice(source.indexOf('const periodObligations'),source.indexOf('const aggregatePeriod'));
  assert.doesNotMatch(obligationsSql,/\bur\./);
});

test('consolidado agrega obligaciones sin reemplazar detalle de caja ni recalcular arqueos cerrados',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../src/services/financialConsolidation.service.js'),'utf8');
  assert.match(source,/detalle_obligaciones: obligations\.detalle/);assert.match(source,/obligaciones_periodo: obligations\.totales/);assert.match(source,/\.\.\.details/);
  assert.doesNotMatch(source,/ArqueoMovimientoSnapshot|ArqueoMovimientoCajaSnapshot|snapshot_resumen\s*=/);
  assert.match(source,/resultado_neto_operativo: money\(income - expenses\)/);
});

test('consolidado GET es solo lectura y no depende de operaciones padre ni cierres', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../src/services/financialConsolidation.service.js'),'utf8');
  const routes=fs.readFileSync(path.join(__dirname,'../../src/routes/planillaPagos.routes.js'),'utf8');
  assert.match(routes,/router\.get\('\/arqueos\/consolidado'/);assert.doesNotMatch(source,/OperacionPago|\.create\(|\.update\(|\.destroy\(|bulkCreate|sincronizar/);
  assert.match(source,/m\.estado='Activo'/);assert.match(source,/asistencia='asistio'/);assert.match(source,/anulada=FALSE/);assert.match(source,/c\.exonerado=FALSE/);
});

test('consolidado entrega detalle real para PDF y Excel sin descuentos ni escrituras',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../../src/services/financialConsolidation.service.js'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../../../frontend/src/pages/planillaPagos/ConsolidadoFinanciero.jsx'),'utf8');
  const excel=fs.readFileSync(path.join(__dirname,'../../../frontend/src/utils/exportConsolidadoFinanciero.js'),'utf8');
  assert.match(source,/detalle_cobros/);assert.match(source,/detalle_egresos/);assert.match(source,/detalle_pacientes/);assert.match(source,/resumen_diario/);
  assert.doesNotMatch(source,/descuento/i);assert.match(ui,/Generar PDF/);assert.match(ui,/Generar Excel/);
  for(const sheet of ['Cobros','Egresos','Deudas','CONTROL INDIVIDUAL POR PACIENTE','Comparación'])assert.match(excel,new RegExp(`'${sheet}'`));
});
