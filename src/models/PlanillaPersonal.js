const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlanillaPersonal = sequelize.define(
  'PlanillaPersonal',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    mes: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 12 } },
    anio: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 2000, max: 2200 } },
    usuario_id: DataTypes.INTEGER,
    observaciones: DataTypes.TEXT
  },
  {
    tableName: 'planillas_personal',
    indexes: [{ unique: true, fields: ['mes', 'anio'] }]
  }
);

module.exports = PlanillaPersonal;
