const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MovimientoPagoAuditoria = sequelize.define('MovimientoPagoAuditoria', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  movimiento_pago_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  accion: { type: DataTypes.STRING(30), allowNull: false },
  motivo: DataTypes.TEXT,
  valor_anterior: DataTypes.JSONB,
  valor_nuevo: DataTypes.JSONB
}, { tableName: 'movimientos_pago_auditoria', updatedAt: false });

module.exports = MovimientoPagoAuditoria;
