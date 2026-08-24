const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS = [
  'INGRESO_EXTRAORDINARIO', 'EGRESO', 'APORTE_CAJA',
  'RETIRO_CAJA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'
];
const METODOS = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const CATEGORIAS = [
  'MATERIAL_MEDICO', 'INSUMOS', 'LIMPIEZA', 'MANTENIMIENTO',
  'SERVICIOS', 'TRANSPORTE', 'PAPELERIA', 'PERSONAL', 'OTROS'
];

const ArqueoMovimientoCajaSnapshot = sequelize.define('ArqueoMovimientoCajaSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  arqueo_id: { type: DataTypes.INTEGER, allowNull: false },
  movimiento_caja_id: DataTypes.INTEGER,
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: { type: DataTypes.TIME, allowNull: false },
  tipo_movimiento_snapshot: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [TIPOS] } },
  categoria_snapshot: { type: DataTypes.STRING(30), validate: { isIn: [CATEGORIAS] } },
  concepto_snapshot: { type: DataTypes.STRING(180), allowNull: false },
  descripcion_snapshot: DataTypes.TEXT,
  motivo_snapshot: DataTypes.TEXT,
  monto_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: Number.MIN_VALUE } },
  metodo_snapshot: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [METODOS] } },
  estado_snapshot: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [['ACTIVO', 'ANULADO']] } },
  origen_snapshot: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [['MANUAL', 'CIERRE_ARQUEO']] } },
  usuario_id: DataTypes.INTEGER,
  usuario_snapshot: DataTypes.STRING(180),
  comprobante_snapshot: DataTypes.STRING(255)
}, {
  tableName: 'arqueo_movimientos_caja_snapshot',
  indexes: [
    { unique: true, fields: ['arqueo_id', 'movimiento_caja_id'] },
    { unique: true, fields: ['movimiento_caja_id'], where: { movimiento_caja_id: { [Op.ne]: null } } }
  ]
});

module.exports = ArqueoMovimientoCajaSnapshot;
