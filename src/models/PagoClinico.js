const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PagoClinico = sequelize.define(
  'PagoClinico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    documento_id: DataTypes.INTEGER,
    usuario_id: DataTypes.INTEGER,
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    monto: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0
    },
    concepto: {
      type: DataTypes.STRING(160),
      allowNull: false,
      defaultValue: 'Administracion de Farmacos'
    },
    metodo_pago: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'Efectivo'
    },
    observaciones: DataTypes.TEXT,
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
  },
  {
    tableName: 'pagos_clinicos'
  }
);

module.exports = PagoClinico;
