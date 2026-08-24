const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('OperacionPago', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true }, paciente_id: { type: DataTypes.INTEGER, allowNull: false },
  historia_clinica_id: DataTypes.INTEGER, fecha: { type: DataTypes.DATEONLY, allowNull: false }, hora: { type: DataTypes.TIME, allowNull: false },
  monto_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, metodo: { type: DataTypes.STRING(30), allowNull: false },
  usuario_receptor_id: { type: DataTypes.INTEGER, allowNull: false }, numero_recibo: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  numero_comprobante: DataTypes.STRING(120), archivo_comprobante: DataTypes.TEXT, observacion: DataTypes.TEXT,
  tipo: { type: DataTypes.STRING(20), allowNull: false }, estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVA' },
  anulado_por_id: DataTypes.INTEGER, anulado_en: DataTypes.DATE, motivo_anulacion: DataTypes.TEXT
}, { tableName: 'operaciones_pago' });
