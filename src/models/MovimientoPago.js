const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MovimientoPago = sequelize.define('MovimientoPago', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  concepto_cobro_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_receptor_id: { type: DataTypes.INTEGER, allowNull: false },
  arqueo_id: DataTypes.INTEGER,
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: { type: DataTypes.TIME, allowNull: false },
  monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  metodo: { type: DataTypes.STRING(30), allowNull: false },
  numero_comprobante: DataTypes.STRING(120),
  archivo_comprobante: DataTypes.TEXT,
  observacion: DataTypes.TEXT,
  numero_recibo: { type: DataTypes.STRING(40), unique: true },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Activo' },
  motivo_anulacion: DataTypes.TEXT,
  anulado_por_id: DataTypes.INTEGER,
  anulado_en: DataTypes.DATE
}, { tableName: 'movimientos_pago' });

module.exports = MovimientoPago;
