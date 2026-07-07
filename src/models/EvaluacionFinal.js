const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const EvaluacionFinal = sequelize.define(
  'EvaluacionFinal',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    evaluacion_postura: DataTypes.TEXT,
    evaluacion_marcha: DataTypes.TEXT,
    diagnostico_kinesico_cif: DataTypes.TEXT,
    plan_tratamiento: DataTypes.TEXT,
    sesiones_contratadas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 }
    },
    periodicidad: DataTypes.STRING(100),
    profesional_cargo: DataTypes.STRING(150)
  },
  { tableName: 'evaluacion_final', timestamps: false }
);

module.exports = EvaluacionFinal;
