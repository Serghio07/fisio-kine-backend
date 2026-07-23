const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConceptoCobro = sequelize.define('ConceptoCobro', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paciente_id: { type: DataTypes.INTEGER, allowNull: false },
  historia_clinica_id: DataTypes.INTEGER,
  sesion_id: { type: DataTypes.INTEGER, unique: true },
  fecha_origen: { type: DataTypes.DATEONLY, allowNull: false },
  tipo: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Otro servicio' },
  detalle: { type: DataTypes.TEXT, allowNull: false },
  monto_esperado: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Pendiente' },
  exonerado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  profesional_responsable: DataTypes.STRING(180),
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'conceptos_cobro' });

module.exports = ConceptoCobro;
