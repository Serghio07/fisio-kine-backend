const { QueryTypes } = require('sequelize');
const { sequelize } = require('../models');
const { boliviaDate } = require('../utils/boliviaDateTime');

const CATEGORIES = ['MATERIAL_MEDICO', 'INSUMOS', 'LIMPIEZA', 'MANTENIMIENTO', 'SERVICIOS', 'TRANSPORTE', 'PAPELERIA', 'PERSONAL', 'OTROS'];
const ADMIN_CATEGORIES = new Set(['PERSONAL', 'PAPELERIA', 'SERVICIOS', 'LIMPIEZA', 'MANTENIMIENTO']);
const SUPPLY_CATEGORIES = new Set(['INSUMOS', 'MATERIAL_MEDICO']);
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const parseDate = (value) => { const [year, month, day] = value.split('-').map(Number); return new Date(Date.UTC(year, month - 1, day)); };
const iso = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const addDays = (value, amount) => { const date = parseDate(value); date.setUTCDate(date.getUTCDate() + amount); return iso(date); };
const monthName = (value) => new Intl.DateTimeFormat('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parseDate(value));
const fail = (message) => Object.assign(new Error(message), { status: 400 });

const resolvePeriod = (query = {}) => {
  const type = query.tipo || (query.desde || query.hasta ? 'personalizado' : 'semana');
  if (!['dia', 'semana', 'mes', 'personalizado'].includes(type)) throw fail('El tipo de período no es válido.');
  let desde; let hasta; let label;
  if (type === 'dia') {
    const reference = query.fecha || query.fechaReferencia || query.fecha_referencia || boliviaDate();
    if (!validDate(reference)) throw fail('La fecha no es válida.');
    desde = reference; hasta = reference; label = `Día ${reference}`;
  } else if (type === 'semana') {
    const reference = query.fechaReferencia || query.fecha_referencia || boliviaDate();
    if (!validDate(reference)) throw fail('La fecha de referencia no es válida.');
    const date = parseDate(reference); const weekday = date.getUTCDay();
    desde = addDays(reference, -((weekday + 6) % 7)); hasta = addDays(desde, 6);
    label = `Semana del ${desde} al ${hasta}`;
  } else if (type === 'mes') {
    const reference = query.fechaReferencia || query.fecha_referencia || query.mes || boliviaDate();
    if (!validDate(reference)) throw fail('El mes de referencia no es válido.');
    const date = parseDate(reference); desde = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))); hasta = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
    label = monthName(desde);
  } else {
    desde = query.desde; hasta = query.hasta;
    if (!validDate(desde) || !validDate(hasta) || desde > hasta) throw fail('Seleccione un período personalizado válido.');
    label = `Del ${desde} al ${hasta}`;
  }
  let previousFrom; let previousTo;
  if (type === 'mes') { const start = parseDate(desde); previousFrom = iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1))); previousTo = iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0))); }
  else { const days = Math.round((parseDate(hasta) - parseDate(desde)) / 86400000) + 1; previousTo = addDays(desde, -1); previousFrom = addDays(previousTo, -(days - 1)); }
  return { tipo: type, desde, hasta, etiqueta: label, anterior_desde: previousFrom, anterior_hasta: previousTo };
};

const dailyClosing = async (date) => {
  const row = await sequelize.query(`SELECT a.*,u.nombre AS responsable_nombre FROM arqueos_pago a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE a.fecha_operativa=:date ORDER BY CASE WHEN a.estado='Cerrado' THEN 0 ELSE 1 END,a.id DESC LIMIT 1`, { replacements: { date }, type: QueryTypes.SELECT, plain: true });
  if (!row) return { existe: false, estado: 'Sin cierre diario', cerrado: false };
  const snapshot = row.snapshot_resumen || {}; const systems = snapshot.sistemas || {}; const confirmed = snapshot.confirmados || {}; const differences = snapshot.diferencias || {};
  const result = snapshot.resultado ?? row.resultado_cierre;
  return { existe: true, cerrado: row.estado === 'Cerrado', estado: row.estado === 'Cerrado' ? `Cerrado — ${result === 'CUADRADO' ? 'Cuadrado' : 'Con diferencia'}` : row.estado,
    numero_arqueo: row.numero_arqueo, responsable: snapshot.responsable_nombre_snapshot ?? row.responsable_nombre ?? 'Responsable no disponible', saldo_inicial: money(snapshot.saldo_inicial_efectivo ?? row.saldo_inicial_efectivo),
    sistema: { efectivo: money(systems.Efectivo ?? row.efectivo_esperado_cierre ?? row.efectivo_sistema), qr: money(systems.QR ?? row.qr_sistema), transferencia: money(systems.Transferencia ?? row.transferencia_sistema), tarjeta: money(systems.Tarjeta ?? row.tarjeta_sistema), otro: money(systems.Otro ?? row.otro_sistema) },
    confirmado: { efectivo: money(confirmed.Efectivo ?? row.efectivo_contado), qr: money(confirmed.QR ?? row.qr_confirmado), transferencia: money(confirmed.Transferencia ?? row.transferencia_confirmada), tarjeta: money(confirmed.Tarjeta ?? row.tarjeta_confirmada), otro: money(confirmed.Otro ?? row.otro_confirmado) },
    diferencias: { efectivo: money(differences.Efectivo ?? row.diferencia_efectivo), qr: money(differences.QR ?? row.diferencia_qr), transferencia: money(differences.Transferencia ?? row.diferencia_transferencia), tarjeta: money(differences.Tarjeta ?? row.diferencia_tarjeta), otro: money(differences.Otro ?? row.diferencia_otro), total: money(snapshot.diferencia_total ?? row.diferencia) },
    resultado: result || null, total_confirmado: money(snapshot.total_confirmado), monto_retirado: money(snapshot.monto_retirado ?? row.monto_retirado), saldo_dejado_caja: money(snapshot.saldo_dejado_caja ?? row.saldo_dejado_caja),
    fecha_cierre: snapshot.cerrado_en_snapshot ?? row.cerrado_en ?? row.fecha_cierre ?? null, observaciones: snapshot.observacion_snapshot ?? row.observacion ?? 'Sin observaciones' };
};

const variation = (current, previous) => {
  const actual = money(current); const anterior = money(previous); const difference = money(actual - anterior);
  if (anterior === 0) return { actual, anterior, diferencia: difference, variacion_porcentaje: actual === 0 ? 0 : null, direccion: actual === 0 ? 'igual' : 'nuevo', etiqueta: actual === 0 ? '0%' : 'Nueva actividad' };
  const percentage = Math.round(((actual - anterior) / anterior) * 10000) / 100;
  return { actual, anterior, diferencia: difference, variacion_porcentaje: percentage, direccion: difference > 0 ? 'sube' : difference < 0 ? 'baja' : 'igual', etiqueta: `${percentage > 0 ? '+' : ''}${percentage.toLocaleString('es-BO', { maximumFractionDigits: 2 })}%` };
};

const aggregatePeriod = async (from, to) => {
  const replacements = { from, to };
  const [clinical, payments, debts, cashRows, closings, activityDays] = await Promise.all([
    sequelize.query(`SELECT COUNT(DISTINCT paciente_id)::integer AS pacientes_atendidos, COUNT(*)::integer AS sesiones_realizadas FROM sesiones WHERE fecha BETWEEN :from AND :to AND asistencia='asistio' AND anulada=FALSE`, { replacements, type: QueryTypes.SELECT, plain: true }),
    sequelize.query(`SELECT COALESCE(SUM(m.monto),0) AS total_cobrado,
      COALESCE(SUM(m.monto) FILTER (WHERE m.metodo='Efectivo'),0) AS efectivo,
      COALESCE(SUM(m.monto) FILTER (WHERE m.metodo='QR'),0) AS qr,
      COALESCE(SUM(m.monto) FILTER (WHERE m.metodo='Transferencia'),0) AS transferencia,
      COALESCE(SUM(m.monto) FILTER (WHERE m.metodo='Tarjeta'),0) AS tarjeta,
      COALESCE(SUM(m.monto) FILTER (WHERE m.metodo='Otro' OR m.metodo NOT IN ('Efectivo','QR','Transferencia','Tarjeta')),0) AS otro,
      COALESCE(SUM(m.monto) FILTER (WHERE LOWER(COALESCE(c.tipo,'')) LIKE '%fisioterapia%'),0) AS fisioterapia,
      COALESCE(SUM(m.monto) FILTER (WHERE LOWER(COALESCE(c.tipo,'')) NOT LIKE '%fisioterapia%'),0) AS otros_servicios
      FROM movimientos_pago m JOIN conceptos_cobro c ON c.id=m.concepto_cobro_id
      WHERE m.estado='Activo' AND m.fecha BETWEEN :from AND :to`, { replacements, type: QueryTypes.SELECT, plain: true }),
    sequelize.query(`SELECT COALESCE(SUM(GREATEST(c.monto_esperado-COALESCE(p.pagado,0),0)),0) AS deuda_vigente_actual,
      COUNT(DISTINCT c.paciente_id) FILTER (WHERE GREATEST(c.monto_esperado-COALESCE(p.pagado,0),0)>0)::integer AS pacientes_con_deuda,
      COALESCE(SUM(GREATEST(c.monto_esperado-COALESCE(p.pagado,0),0)) FILTER (WHERE c.fecha_origen BETWEEN :from AND :to),0) AS deuda_originada_periodo
      FROM conceptos_cobro c LEFT JOIN (SELECT concepto_cobro_id,SUM(monto) AS pagado FROM movimientos_pago WHERE estado='Activo' GROUP BY concepto_cobro_id) p ON p.concepto_cobro_id=c.id
      WHERE c.activo=TRUE AND c.exonerado=FALSE AND c.estado<>'Anulado'`, { replacements, type: QueryTypes.SELECT, plain: true }),
    sequelize.query(`SELECT tipo_movimiento,categoria,COALESCE(SUM(monto),0) AS monto FROM movimientos_caja WHERE estado='ACTIVO' AND fecha BETWEEN :from AND :to GROUP BY tipo_movimiento,categoria`, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT COUNT(*)::integer AS cantidad_cierres, COUNT(*) FILTER (WHERE resultado_cierre='CUADRADO')::integer AS cuadrados, COUNT(*) FILTER (WHERE resultado_cierre='CON_DIFERENCIA')::integer AS con_diferencia, COALESCE(SUM(COALESCE(diferencia_efectivo,0)+COALESCE(diferencia_qr,0)+COALESCE(diferencia_transferencia,0)+COALESCE(diferencia_tarjeta,0)+COALESCE(diferencia_otro,0)),0) AS diferencias FROM arqueos_pago WHERE estado='Cerrado' AND fecha_operativa BETWEEN :from AND :to`, { replacements, type: QueryTypes.SELECT, plain: true }),
    sequelize.query(`SELECT COUNT(DISTINCT fecha)::integer AS dias FROM (SELECT fecha FROM movimientos_pago WHERE estado='Activo' AND fecha BETWEEN :from AND :to UNION SELECT fecha FROM movimientos_caja WHERE estado='ACTIVO' AND fecha BETWEEN :from AND :to UNION SELECT fecha FROM sesiones WHERE asistencia='asistio' AND anulada=FALSE AND fecha BETWEEN :from AND :to) actividad`, { replacements, type: QueryTypes.SELECT, plain: true })
  ]);
  const cash = Object.fromEntries(['INGRESO_EXTRAORDINARIO','EGRESO','APORTE_CAJA','RETIRO_CAJA','AJUSTE_POSITIVO','AJUSTE_NEGATIVO'].map((type) => [type, 0]));
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
  for (const row of cashRows) { cash[row.tipo_movimiento] = money(cash[row.tipo_movimiento] + Number(row.monto)); if (row.tipo_movimiento === 'EGRESO' && row.categoria) categories[row.categoria] = money((categories[row.categoria] || 0) + Number(row.monto)); }
  const expenses = money(cash.EGRESO); const totalPaid = money(payments.total_cobrado); const extraordinary = money(cash.INGRESO_EXTRAORDINARIO); const income = money(totalPaid + extraordinary);
  const categoryRows = CATEGORIES.map((category) => ({ categoria: category, monto: money(categories[category]), porcentaje: expenses ? Math.round((categories[category] / expenses) * 10000) / 100 : 0 }));
  const activityCount = Number(activityDays.dias || 0); const closingCount = Number(closings.cantidad_cierres || 0);
  return {
    actividad_clinica: { pacientes_atendidos: Number(clinical.pacientes_atendidos || 0), sesiones_realizadas: Number(clinical.sesiones_realizadas || 0) },
    cobros: { total_cobrado: totalPaid, efectivo: money(payments.efectivo), qr: money(payments.qr), transferencia: money(payments.transferencia), qr_transferencia_total: money(Number(payments.qr) + Number(payments.transferencia)), tarjeta: money(payments.tarjeta), otro: money(payments.otro) },
    servicios: { ingresos_fisioterapia: money(payments.fisioterapia), ingresos_otros_servicios: money(payments.otros_servicios), clasificacion: 'Clasificación basada en ConceptoCobro.tipo' },
    deuda: { deuda_vigente_actual: money(debts.deuda_vigente_actual), deuda_originada_periodo: money(debts.deuda_originada_periodo), pacientes_con_deuda: Number(debts.pacientes_con_deuda || 0), total_cuentas_por_cobrar: money(debts.deuda_vigente_actual) },
    caja: { ingresos_extraordinarios: extraordinary, egresos_operativos: expenses, aportes: money(cash.APORTE_CAJA), retiros: money(cash.RETIRO_CAJA), ajustes_positivos: money(cash.AJUSTE_POSITIVO), ajustes_negativos: money(cash.AJUSTE_NEGATIVO) },
    resultado: { total_ingresos_operativos: income, total_egresos_operativos: expenses, resultado_neto_operativo: money(income - expenses) },
    gastos_resumen: { administrativos: money(categoryRows.filter((row) => ADMIN_CATEGORIES.has(row.categoria)).reduce((sum, row) => sum + row.monto, 0)), insumos: money(categoryRows.filter((row) => SUPPLY_CATEGORIES.has(row.categoria)).reduce((sum, row) => sum + row.monto, 0)), otros: money(categories.OTROS) },
    gastos_por_categoria: categoryRows,
    cierres_diarios: { cantidad: closingCount, cuadrados: Number(closings.cuadrados || 0), con_diferencia: Number(closings.con_diferencia || 0), diferencias: money(closings.diferencias), dias_con_actividad: activityCount, estado: activityCount === 0 ? 'Sin actividad en el período' : closingCount === 0 ? 'Período con actividad financiera sin cierres diarios completos' : closingCount >= activityCount ? 'Cierres diarios disponibles' : 'Período con cierres diarios parciales' },
    tiene_actividad: activityCount > 0
  };
};

const comparableMetrics = (data) => ({
  pacientes_atendidos: data.actividad_clinica.pacientes_atendidos, sesiones_realizadas: data.actividad_clinica.sesiones_realizadas,
  total_cobrado: data.cobros.total_cobrado, efectivo: data.cobros.efectivo, qr: data.cobros.qr, transferencia: data.cobros.transferencia, tarjeta: data.cobros.tarjeta, otro: data.cobros.otro,
  ingresos_extraordinarios: data.caja.ingresos_extraordinarios, total_ingresos_operativos: data.resultado.total_ingresos_operativos, total_egresos_operativos: data.resultado.total_egresos_operativos, resultado_neto_operativo: data.resultado.resultado_neto_operativo,
  pendiente_servicios_originados: data.deuda.deuda_originada_periodo
});

const periodDetails = async (from, to) => {
  const replacements = { from, to };
  const [collections, expenses, patients, days] = await Promise.all([
    sequelize.query(`SELECT m.id,m.fecha,
      CASE WHEN m.numero_recibo LIKE 'REC-SES-%' AND s.created_at IS NOT NULL THEN TO_CHAR(s.created_at AT TIME ZONE 'America/La_Paz','HH24:MI:SS') ELSE m.hora::text END AS hora,
      m.monto,m.metodo,
      COALESCE(o.numero_recibo,m.numero_recibo,'Sin recibo') AS numero_recibo,
      p.id AS paciente_id,TRIM(CONCAT(COALESCE(p.nombres,''),' ',COALESCE(p.apellidos,''))) AS paciente,
      COALESCE(p.numero_documento,p.ci,'Sin documento') AS documento,
      CASE
        WHEN s.numero_sesion IS NOT NULL THEN CONCAT(
          'Sesión ',s.numero_sesion,'-',
          COALESCE(
            NULLIF(s.sesiones_debe,0),
            (SELECT MAX(cx.total_sesiones) FROM citas cx WHERE cx.historia_clinica_id=s.historia_clinica_id AND cx.total_sesiones IS NOT NULL),
            (SELECT MAX(sx.numero_sesion) FROM sesiones sx WHERE sx.historia_clinica_id=s.historia_clinica_id AND sx.anulada=false),
            s.numero_sesion
          )
        )
        ELSE COALESCE(c.tipo,'Servicio')
      END AS servicio,
      s.numero_sesion,
      COALESCE(
        NULLIF(s.sesiones_debe,0),
        (SELECT MAX(cx.total_sesiones) FROM citas cx WHERE cx.historia_clinica_id=s.historia_clinica_id AND cx.total_sesiones IS NOT NULL),
        (SELECT MAX(sx.numero_sesion) FROM sesiones sx WHERE sx.historia_clinica_id=s.historia_clinica_id AND sx.anulada=false),
        s.numero_sesion
      ) AS total_sesiones,
      COALESCE(s.profesional_responsable,c.profesional_responsable,'Sin registrar') AS profesional,
      GREATEST(c.monto_esperado-COALESCE((SELECT SUM(mx.monto) FROM movimientos_pago mx WHERE mx.concepto_cobro_id=c.id AND mx.estado='Activo'),0),0) AS saldo_servicio
      FROM movimientos_pago m JOIN conceptos_cobro c ON c.id=m.concepto_cobro_id
      JOIN pacientes p ON p.id=c.paciente_id LEFT JOIN sesiones s ON s.id=c.sesion_id
      LEFT JOIN operaciones_pago o ON o.id=m.operacion_pago_id
      WHERE m.estado='Activo' AND m.fecha BETWEEN :from AND :to ORDER BY m.fecha,m.hora,m.id`, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT id,fecha,hora,concepto,COALESCE(categoria,'OTROS') AS categoria,monto,metodo
      FROM movimientos_caja WHERE estado='ACTIVO' AND tipo_movimiento='EGRESO' AND fecha BETWEEN :from AND :to ORDER BY fecha,hora,id`, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT p.id AS paciente_id,TRIM(CONCAT(COALESCE(p.nombres,''),' ',COALESCE(p.apellidos,''))) AS paciente,
      COALESCE(p.numero_documento,p.ci,'Sin documento') AS documento,
      COUNT(DISTINCT s.id) FILTER (WHERE s.fecha BETWEEN :from AND :to AND s.asistencia='asistio' AND s.anulada=FALSE)::integer AS sesiones_realizadas,
      COALESCE((SELECT SUM(cc.monto_esperado) FROM conceptos_cobro cc WHERE cc.paciente_id=p.id AND cc.activo=TRUE AND cc.exonerado=FALSE),0) AS total_tratamiento,
      COALESCE((SELECT SUM(mp.monto) FROM movimientos_pago mp JOIN conceptos_cobro cc ON cc.id=mp.concepto_cobro_id WHERE cc.paciente_id=p.id AND mp.estado='Activo' AND mp.fecha BETWEEN :from AND :to),0) AS pagado_periodo,
      COALESCE((SELECT SUM(mp.monto) FROM movimientos_pago mp JOIN conceptos_cobro cc ON cc.id=mp.concepto_cobro_id WHERE cc.paciente_id=p.id AND mp.estado='Activo'),0) AS pagado_acumulado,
      COALESCE((SELECT SUM(GREATEST(cc.monto_esperado-COALESCE(pp.pagado,0),0)) FROM conceptos_cobro cc LEFT JOIN (SELECT concepto_cobro_id,SUM(monto) AS pagado FROM movimientos_pago WHERE estado='Activo' GROUP BY concepto_cobro_id) pp ON pp.concepto_cobro_id=cc.id WHERE cc.paciente_id=p.id AND cc.activo=TRUE AND cc.exonerado=FALSE),0) AS deuda_actual
      FROM pacientes p LEFT JOIN sesiones s ON s.paciente_id=p.id
      WHERE EXISTS (SELECT 1 FROM sesiones sx WHERE sx.paciente_id=p.id AND sx.fecha BETWEEN :from AND :to AND sx.asistencia='asistio' AND sx.anulada=FALSE)
         OR EXISTS (SELECT 1 FROM movimientos_pago mx JOIN conceptos_cobro cx ON cx.id=mx.concepto_cobro_id WHERE cx.paciente_id=p.id AND mx.estado='Activo' AND mx.fecha BETWEEN :from AND :to)
      GROUP BY p.id,p.nombres,p.apellidos,p.numero_documento,p.ci ORDER BY paciente`, { replacements, type: QueryTypes.SELECT }),
    sequelize.query(`SELECT d::date AS fecha,
      (SELECT COUNT(DISTINCT paciente_id) FROM sesiones WHERE fecha=d::date AND asistencia='asistio' AND anulada=FALSE)::integer AS pacientes_atendidos,
      (SELECT COUNT(*) FROM sesiones WHERE fecha=d::date AND asistencia='asistio' AND anulada=FALSE)::integer AS sesiones,
      COALESCE((SELECT SUM(monto) FROM movimientos_pago WHERE fecha=d::date AND estado='Activo'),0) AS total_cobrado,
      COALESCE((SELECT SUM(monto) FROM movimientos_pago WHERE fecha=d::date AND estado='Activo' AND metodo='Efectivo'),0) AS efectivo,
      COALESCE((SELECT SUM(monto) FROM movimientos_pago WHERE fecha=d::date AND estado='Activo' AND metodo IN ('QR','Transferencia')),0) AS qr_transferencia,
      COALESCE((SELECT SUM(monto) FROM movimientos_pago WHERE fecha=d::date AND estado='Activo' AND metodo='Tarjeta'),0) AS tarjeta,
      COALESCE((SELECT SUM(GREATEST(c.monto_esperado-COALESCE(pm.pagado,0),0)) FROM conceptos_cobro c LEFT JOIN (SELECT concepto_cobro_id,SUM(monto) AS pagado FROM movimientos_pago WHERE estado='Activo' GROUP BY concepto_cobro_id) pm ON pm.concepto_cobro_id=c.id WHERE c.fecha_origen=d::date AND c.activo=TRUE AND c.exonerado=FALSE),0) AS deuda_generada,
      COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE fecha=d::date AND estado='ACTIVO' AND tipo_movimiento='EGRESO'),0) AS gastos,
      COALESCE((SELECT SUM(monto) FROM movimientos_pago WHERE fecha=d::date AND estado='Activo'),0)+COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE fecha=d::date AND estado='ACTIVO' AND tipo_movimiento='INGRESO_EXTRAORDINARIO'),0)-COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE fecha=d::date AND estado='ACTIVO' AND tipo_movimiento='EGRESO'),0) AS resultado_neto
      FROM generate_series(:from::date,:to::date,'1 day') d ORDER BY d`, { replacements, type: QueryTypes.SELECT })
  ]);
  return {
    detalle_cobros: collections.map((row) => ({ ...row, monto: money(row.monto), deuda_actual: money(row.saldo_servicio), estado_deuda: Number(row.saldo_servicio || 0) > 0 ? 'Pendiente' : 'Sin deuda' })),
    detalle_egresos: expenses.map((row) => ({ ...row, monto: money(row.monto) })),
    detalle_pacientes: patients.map((row) => ({ ...row, total_tratamiento: money(row.total_tratamiento), pagado_periodo: money(row.pagado_periodo), pagado_acumulado: money(row.pagado_acumulado), deuda_actual: money(row.deuda_actual) })),
    resumen_diario: days.map((row) => ({ ...row, pacientes_atendidos: Number(row.pacientes_atendidos), sesiones: Number(row.sesiones), total_cobrado: money(row.total_cobrado), efectivo: money(row.efectivo), qr_transferencia: money(row.qr_transferencia), tarjeta: money(row.tarjeta), deuda_generada: money(row.deuda_generada), gastos: money(row.gastos), resultado_neto: money(row.resultado_neto) }))
  };
};

const consolidated = async (query = {}) => {
  const period = resolvePeriod(query);
  const [current, previous, arqueoDiario, details] = await Promise.all([aggregatePeriod(period.desde, period.hasta), aggregatePeriod(period.anterior_desde, period.anterior_hasta), period.tipo === 'dia' ? dailyClosing(period.desde) : Promise.resolve(null), periodDetails(period.desde, period.hasta)]);
  const currentMetrics = comparableMetrics(current); const previousMetrics = comparableMetrics(previous);
  const metrics = Object.fromEntries(Object.keys(currentMetrics).map((key) => [key, variation(currentMetrics[key], previousMetrics[key])]));
  return {
    periodo: { tipo: period.tipo, desde: period.desde, hasta: period.hasta, etiqueta: period.etiqueta },
    ...current,
    ...details,
    arqueo_diario: arqueoDiario,
    comparacion: { periodo_anterior: { desde: period.anterior_desde, hasta: period.anterior_hasta }, metricas: metrics },
    desde: period.desde, hasta: period.hasta, cantidad_cierres: current.cierres_diarios.cantidad, arqueos_cuadrados: current.cierres_diarios.cuadrados, arqueos_con_diferencia: current.cierres_diarios.con_diferencia,
    total_cobrado_pacientes: current.cobros.total_cobrado, ingresos_extraordinarios: current.caja.ingresos_extraordinarios, egresos: current.caja.egresos_operativos, aportes: current.caja.aportes, retiros: current.caja.retiros,
    efectivo: current.cobros.efectivo, qr: current.cobros.qr, transferencia: current.cobros.transferencia, tarjeta: current.cobros.tarjeta, otro: current.cobros.otro, diferencias: current.cierres_diarios.diferencias,
    ingresos_operativos: current.resultado.total_ingresos_operativos, resultado_neto: current.resultado.resultado_neto_operativo
  };
};

module.exports = { CATEGORIES, resolvePeriod, variation, aggregatePeriod, periodDetails, dailyClosing, consolidated };
