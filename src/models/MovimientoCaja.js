const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS_MOVIMIENTO_CAJA = [
  'INGRESO_EXTRAORDINARIO', 'EGRESO', 'APORTE_CAJA',
  'RETIRO_CAJA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'
];
const METODOS_MOVIMIENTO_CAJA = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const CATEGORIAS_EGRESO = [
  'MATERIAL_MEDICO', 'INSUMOS', 'LIMPIEZA', 'MANTENIMIENTO',
  'SERVICIOS', 'TRANSPORTE', 'PAPELERIA', 'PERSONAL', 'OTROS'
];
const ESTADOS_MOVIMIENTO_CAJA = ['ACTIVO', 'ANULADO'];
const ORIGENES_MOVIMIENTO_CAJA = ['MANUAL', 'CIERRE_ARQUEO'];

const MovimientoCaja = sequelize.define('MovimientoCaja', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: { type: DataTypes.TIME, allowNull: false },
  tipo_movimiento: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [TIPOS_MOVIMIENTO_CAJA] } },
  categoria: { type: DataTypes.STRING(30), allowNull: true, validate: { isIn: [CATEGORIAS_EGRESO] } },
  concepto: { type: DataTypes.STRING(180), allowNull: false, validate: { notEmpty: true } },
  descripcion: DataTypes.TEXT,
  motivo: DataTypes.TEXT,
  monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: Number.MIN_VALUE } },
  metodo: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [METODOS_MOVIMIENTO_CAJA] } },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  arqueo_id: DataTypes.INTEGER,
  origen: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL', validate: { isIn: [ORIGENES_MOVIMIENTO_CAJA] } },
  comprobante: DataTypes.STRING(255),
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVO', validate: { isIn: [ESTADOS_MOVIMIENTO_CAJA] } },
  anulado_por_id: DataTypes.INTEGER,
  anulado_en: DataTypes.DATE,
  motivo_anulacion: DataTypes.TEXT
}, { tableName: 'movimientos_caja' });

module.exports = {
  MovimientoCaja,
  TIPOS_MOVIMIENTO_CAJA,
  METODOS_MOVIMIENTO_CAJA,
  CATEGORIAS_EGRESO,
  ESTADOS_MOVIMIENTO_CAJA,
  ORIGENES_MOVIMIENTO_CAJA
};
