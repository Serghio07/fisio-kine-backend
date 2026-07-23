const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ArqueoPago = sequelize.define('ArqueoPago', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha_desde: { type: DataTypes.DATEONLY, allowNull: false },
  fecha_hasta: { type: DataTypes.DATEONLY, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  total_esperado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  total_cobrado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  total_pendiente: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  efectivo_sistema: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  efectivo_contado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  qr_sistema: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  qr_confirmado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  transferencia_sistema: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  transferencia_confirmada: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  tarjeta_sistema: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  tarjeta_confirmada: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  diferencia: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  cantidad_movimientos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  pacientes_deuda: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  observacion: DataTypes.TEXT,
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Borrador' },
  cerrado_en: DataTypes.DATE,
  reabierto_en: DataTypes.DATE,
  reabierto_por_id: DataTypes.INTEGER,
  motivo_reapertura: DataTypes.TEXT
}, { tableName: 'arqueos_pago' });

module.exports = ArqueoPago;
