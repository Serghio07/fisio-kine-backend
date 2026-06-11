const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AntecedentePersonal = sequelize.define(
  'AntecedentePersonal',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    patologicos: { type: DataTypes.BOOLEAN, defaultValue: false },
    hospitalarios: { type: DataTypes.BOOLEAN, defaultValue: false },
    quirurgicos: { type: DataTypes.BOOLEAN, defaultValue: false },
    traumaticos: { type: DataTypes.BOOLEAN, defaultValue: false },
    alergicos: { type: DataTypes.BOOLEAN, defaultValue: false },
    farmacologicos: { type: DataTypes.BOOLEAN, defaultValue: false },
    detalle_patologicos: DataTypes.TEXT,
    detalle_hospitalarios: DataTypes.TEXT,
    detalle_quirurgicos: DataTypes.TEXT,
    detalle_traumaticos: DataTypes.TEXT,
    detalle_alergicos: DataTypes.TEXT,
    detalle_farmacologicos: DataTypes.TEXT,
    observaciones: DataTypes.TEXT
  },
  { tableName: 'antecedentes_personales', timestamps: false }
);

module.exports = AntecedentePersonal;
