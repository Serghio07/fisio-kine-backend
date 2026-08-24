const { calculatePaymentState } = require('./paymentFinancialState.service');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const financialPeriods = (today) => {
  const current = new Date(`${today}T12:00:00`);
  const weekStart = new Date(current);
  weekStart.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    hoy: today,
    semana_inicio: iso(weekStart),
    semana_fin: iso(weekEnd),
    mes_inicio: iso(new Date(current.getFullYear(), current.getMonth(), 1)),
    mes_fin: iso(new Date(current.getFullYear(), current.getMonth() + 1, 0))
  };
};

const movementTime = (movement) => `${movement.fecha || ''} ${String(movement.hora || '').slice(0, 8)}`;

const buildPatientFinancialSummary = ({ concepts = [], sessionsPerformed = 0, periods }) => {
  const rows = concepts.map((source) => {
    const concept = source?.toJSON ? source.toJSON() : source;
    const activeMovements = (concept.movimientos || []).filter((movement) => movement.estado === 'Activo');
    const paid = money(activeMovements.reduce((sum, movement) => sum + Number(movement.monto || 0), 0));
    const financial = calculatePaymentState(concept, paid);
    return {
      id: concept.id,
      historia_clinica_id: concept.historia_clinica_id || null,
      historia: concept.historia_clinica || null,
      sesion: concept.sesion ? { id: concept.sesion.id, numero_sesion: concept.sesion.numero_sesion, fecha: concept.sesion.fecha } : null,
      fecha: concept.fecha_origen,
      tipo: concept.tipo,
      descripcion: concept.detalle,
      esperado: money(financial.esperado_cobrable),
      esperado_nominal: money(concept.monto_esperado),
      pagado: paid,
      saldo: money(financial.saldo),
      estado: financial.estado,
      exonerado: Boolean(concept.exonerado),
      activo: Boolean(concept.activo),
      movimientos: activeMovements
    };
  });
  const movements = rows.flatMap((row) => row.movimientos.map((movement) => ({ ...movement, concepto_id: row.id })));
  const paidInRange = (from, to) => money(movements.filter((movement) => movement.fecha >= from && movement.fecha <= to).reduce((sum, movement) => sum + Number(movement.monto || 0), 0));
  const totalPaid = money(movements.reduce((sum, movement) => sum + Number(movement.monto || 0), 0));
  const methods = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'].map((method) => {
    const amount = money(movements.filter((movement) => (['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'].includes(movement.metodo) ? movement.metodo : 'Otro') === method).reduce((sum, movement) => sum + Number(movement.monto || 0), 0));
    return { metodo: method, monto: amount, porcentaje: totalPaid ? Math.round((amount / totalPaid) * 10000) / 100 : 0 };
  });
  const latestMovement = [...movements].sort((a, b) => movementTime(b).localeCompare(movementTime(a)))[0] || null;
  const operation = latestMovement?.operacion_pago && latestMovement.operacion_pago.estado === 'ACTIVA' ? latestMovement.operacion_pago : null;
  const lastPayment = latestMovement ? {
    id: operation?.id || latestMovement.id,
    movimiento_id: latestMovement.id,
    legacy: !operation,
    tipo: operation?.tipo || 'LEGACY',
    fecha: operation?.fecha || latestMovement.fecha,
    hora: operation?.hora || latestMovement.hora,
    monto: money(operation?.monto_total ?? latestMovement.monto),
    metodo: operation?.metodo || latestMovement.metodo,
    numero_recibo: operation?.numero_recibo || latestMovement.numero_recibo || null,
    numero_comprobante: operation?.numero_comprobante || latestMovement.numero_comprobante || null,
    archivo_comprobante: operation?.archivo_comprobante || latestMovement.archivo_comprobante || null,
    recibido_por: latestMovement.recibido_por || null
  } : null;
  return {
    resumen: {
      sesiones_realizadas: Number(sessionsPerformed || 0),
      total_esperado: money(rows.reduce((sum, row) => sum + row.esperado, 0)),
      pagado_hoy: paidInRange(periods.hoy, periods.hoy),
      pagado_semana: paidInRange(periods.semana_inicio, periods.semana_fin),
      pagado_mes: paidInRange(periods.mes_inicio, periods.mes_fin),
      pagado_total: totalPaid,
      saldo_pendiente: money(rows.reduce((sum, row) => sum + row.saldo, 0))
    },
    ultimo_pago: lastPayment,
    metodos: methods,
    conceptos: rows.map(({ movimientos: ignored, ...row }) => row)
  };
};

module.exports = { financialPeriods, buildPatientFinancialSummary };
