const { ActividadSistema } = require('../models');
const { boliviaDateTime } = require('../utils/boliviaDateTime');

const FINANCIAL_KEYS = new Set([
  'pago',
  'pagos',
  'payments',
  'deuda',
  'deudas',
  'debts',
  'deudores',
  'concepto_cobro',
  'conceptos_cobro',
  'conceptos',
  'movimiento',
  'movimientos',
  'movements',
  'arqueo',
  'arqueos',
  'recibo',
  'recibos',
  'comprobante',
  'comprobantes',
  'metodo_pago',
  'metodos_pago',
  'estado_pago',
  'observacion_pago',
  'motivo_sin_costo',
  'monto',
  'monto_bs',
  'monto_sesion',
  'monto_pagado',
  'monto_esperado',
  'monto_total',
  'total_pagado',
  'total_cobrado',
  'total_facturado',
  'total_esperado',
  'total_pendiente',
  'saldo',
  'saldo_bs',
  'saldo_pendiente',
  'debe_bs',
  'costo',
  'costo_unitario',
  'costo_total',
  'precio',
  'descuento',
  'numero_recibo',
  'historial_financiero',
  'resumen_financiero',
  'estadisticas_financieras',
  'ultimos_pagos',
  'pagos_registrados'
]);

const esPersonal = (req) => (req.user || req.usuario)?.rol === 'personal';

const limpiarFinanzas = (value) => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== 'object') return true;
        const descriptor = `${item.tipo || ''} ${item.modulo || ''} ${item.categoria || ''}`.toLowerCase();
        return !/pago|deuda|financ|cobro|arqueo|recibo|comprobante/.test(descriptor);
      })
      .map(limpiarFinanzas);
  }
  if (!value || typeof value !== 'object') return value;
  const plainValue = typeof value.toJSON === 'function' ? value.toJSON() : value;
  return Object.entries(plainValue).reduce((result, [key, item]) => {
    if (!FINANCIAL_KEYS.has(String(key).toLowerCase())) {
      result[key] = limpiarFinanzas(item);
    }
    return result;
  }, {});
};

const filtrarRespuestaFinanciera = (req, res, next) => {
  if (!esPersonal(req)) return next();
  const jsonOriginal = res.json.bind(res);
  res.json = (body) => jsonOriginal(limpiarFinanzas(body));
  return next();
};

const sanearEntradaFinanciera = (req, res, next) => {
  if (esPersonal(req) && req.body && typeof req.body === 'object') {
    req.body = limpiarFinanzas(req.body);
  }
  return next();
};

const registrarAccesoDenegado = (req, detalle) => {
  const usuario = req.user || req.usuario;
  if (!usuario?.id) return;
  const { fecha, hora } = boliviaDateTime();
  ActividadSistema.create({
    usuario_id: usuario.id,
    paciente_id: req.body?.paciente_id || null,
    entidad_id: null,
    fecha,
    hora,
    modulo: 'Seguridad',
    accion: 'Acceso denegado',
    detalle: String(detalle || 'Intentó acceder a un recurso restringido').slice(0, 500),
    datos: { rol: usuario.rol, query: req.query || {} },
    metodo: req.method,
    ruta: req.originalUrl.split('?')[0]
  }).catch((error) => console.error('No se pudo auditar el acceso denegado:', error.message));
};

const soloAdministradorFinanciero = (req, res, next) => {
  const usuario = req.user || req.usuario;
  if (usuario?.rol === 'admin') return next();
  registrarAccesoDenegado(req, 'Intentó acceder a información financiera exclusiva del Administrador.');
  return res.status(403).json({
    success: false,
    message: 'No tienes permisos para acceder a la información financiera.'
  });
};

const bloquearSeccionFinanciera = (req, res, next) => {
  const seccion = String(req.query.seccion || '').toLowerCase();
  if (!esPersonal(req) || !['pagos', 'deudas'].includes(seccion)) return next();
  registrarAccesoDenegado(req, `Intentó consultar la sección financiera "${seccion}" desde un endpoint clínico.`);
  return res.status(403).json({
    success: false,
    message: 'No tienes permisos para acceder a la información financiera.'
  });
};

module.exports = {
  FINANCIAL_KEYS,
  limpiarFinanzas,
  filtrarRespuestaFinanciera,
  sanearEntradaFinanciera,
  registrarAccesoDenegado,
  soloAdministradorFinanciero,
  bloquearSeccionFinanciera
};
