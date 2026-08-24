const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ArqueoMovimientoSnapshot = sequelize.define('ArqueoMovimientoSnapshot', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  arqueo_id: { type: DataTypes.INTEGER, allowNull: false },
  movimiento_pago_id: DataTypes.INTEGER,
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: DataTypes.TIME,
  paciente_id: DataTypes.INTEGER,
  paciente_nombre_snapshot: { type: DataTypes.STRING(320), allowNull: false },
  documento_snapshot: DataTypes.STRING(80),
  historia_clinica_id: DataTypes.INTEGER,
  historia_snapshot: DataTypes.STRING(120),
  concepto_snapshot: { type: DataTypes.STRING(500), allowNull: false },
  metodo_snapshot: { type: DataTypes.STRING(30), allowNull: false },
  monto_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: Number.MIN_VALUE } },
  estado_snapshot: { type: DataTypes.STRING(20), allowNull: false },
  recibido_por_id: DataTypes.INTEGER,
  recibido_por_snapshot: DataTypes.STRING(120)
}, {
  tableName: 'arqueo_movimientos_snapshot',
  indexes: [{ unique: true, fields: ['arqueo_id', 'movimiento_pago_id'] }]
});

module.exports = ArqueoMovimientoSnapshot;
