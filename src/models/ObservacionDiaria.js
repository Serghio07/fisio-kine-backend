const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ObservacionDiaria = sequelize.define('ObservacionDiaria', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: { type: DataTypes.TIME, allowNull: false },
  categoria: { type: DataTypes.STRING(80), allowNull: false },
  descripcion: { type: DataTypes.TEXT, allowNull: false },
  paciente_id: DataTypes.INTEGER,
  responsable_id: { type: DataTypes.INTEGER, allowNull: false },
  creado_por_id: { type: DataTypes.INTEGER, allowNull: false },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Pendiente' },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'observaciones_diarias' });

module.exports = ObservacionDiaria;
