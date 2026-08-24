const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HistorialAmpliacionSesiones = sequelize.define('HistorialAmpliacionSesiones', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  evaluacion_final_id: { type: DataTypes.INTEGER, allowNull: false },
  historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
  total_anterior: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  incremento: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  total_nuevo: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 2 } },
  motivo: { type: DataTypes.STRING(500), allowNull: false, validate: { notEmpty: true } },
  creado_por_id: { type: DataTypes.INTEGER, allowNull: false },
  solicitud_id: { type: DataTypes.UUID, allowNull: false, unique: true }
}, { tableName: 'historial_ampliaciones_sesiones' });

module.exports = HistorialAmpliacionSesiones;
