const models = require('../models');
const arqueo = require('../services/arqueoCaja.service');
const caja = require('../services/movimientoCaja.service');
const { boliviaDate } = require('../utils/boliviaDateTime');

(async () => {
  const counts = await Promise.all([
    models.ConceptoCobro.count(), models.MovimientoPago.count(), models.MovimientoCaja.count(),
    models.ArqueoPago.count(), models.ArqueoMovimientoSnapshot.count(), models.ArqueoMovimientoCajaSnapshot.count(),
    models.MovimientoPago.sum('monto', { where: { estado: 'Activo' } })
  ]);
  const fecha = process.argv[2] || boliviaDate(); const saldoInicial = Number(process.argv[3] || 100);
  const current = await arqueo.current(fecha);
  const preview = await arqueo.preview({ fecha_operativa: fecha, saldo_inicial_manual: saldoInicial });
  const summary = await caja.resumen({ desde: fecha, hasta: fecha });
  process.stdout.write(`${JSON.stringify({ counts, current, preview, summary }, null, 2)}\n`);
  await models.sequelize.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
