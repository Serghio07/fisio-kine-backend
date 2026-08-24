const controller = require('../controllers/planillaPagos.controller');
const sequelize = require('../config/database');
const { ConceptoCobro, MovimientoPago, OperacionPago } = require('../models');
const { calculatePaymentState } = require('../services/paymentFinancialState.service');
const { validatePaymentOperation } = require('../services/paymentOperationIntegrity.service');

const req = { query: { desde: process.argv[2] || '2026-08-22', hasta: process.argv[3] || process.argv[2] || '2026-08-22' } };
const res = {
  status(code) { this.statusCode = code; return this; },
  async json(body) {
    const operations = await OperacionPago.findAll({ include: [{ model: MovimientoPago, as: 'aplicaciones' }] });
    const concepts = await ConceptoCobro.findAll({ include: [{ model: MovimientoPago, as: 'movimientos', required: false }] });
    const conceptIntegrity = concepts.map((concept) => { const item=concept.toJSON();const paid=item.movimientos.filter((movement)=>movement.estado==='Activo').reduce((sum,movement)=>sum+Number(movement.monto),0);return { concepto_id:item.id, exonerado:item.exonerado, ...calculatePaymentState(item,paid) }; });
    const [duplicateReceipts] = await sequelize.query(`SELECT numero_recibo, COUNT(*)::integer cantidad FROM operaciones_pago GROUP BY numero_recibo HAVING COUNT(*) > 1`);
    const legacy = await MovimientoPago.count({ where: { operacion_pago_id: null } });
    const unclosedPayments = await MovimientoPago.count({ where: { estado: 'Activo', arqueo_id: null } });
    console.log(JSON.stringify({
      items: body.items?.map((item) => ({ id: item.id, pagado_periodo: item.pagado_periodo, pagado_acumulado: item.total_pagado, saldo: item.saldo_pendiente, estado: item.estado })),
      operaciones: body.operaciones?.map((item) => ({ id: item.id, recibo: item.numero_recibo, monto: item.monto_total, aplicaciones: item.aplicaciones.length })),
      indicadores: body.indicadores,
      integridad_operaciones: operations.map(validatePaymentOperation),
      integridad_conceptos: conceptIntegrity,
      recibos_duplicados: duplicateReceipts,
      movimientos_legacy: legacy,
      pagos_activos_sin_arqueo: unclosedPayments
    }, null, 2));
    return sequelize.close();
  }
};

controller.listar(req, res, async (error) => { console.error(error); await sequelize.close(); process.exitCode = 1; });
