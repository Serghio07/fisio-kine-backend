const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ExamenKinesico = sequelize.define(
  'ExamenKinesico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    observacion: DataTypes.TEXT,
    inspeccion: DataTypes.TEXT,
    palpacion: DataTypes.TEXT,
    pruebas_especificas: DataTypes.TEXT
  },
  { tableName: 'examen_kinesico', timestamps: false }
);

module.exports = ExamenKinesico;
