const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlanillaAtencion = sequelize.define(
  'PlanillaAtencion',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha_inicio: DataTypes.DATEONLY,
    fecha_fin: DataTypes.DATEONLY,
    diagnostico: DataTypes.TEXT,
    observacion: DataTypes.TEXT
  },
  {
    tableName: 'planillas_atencion_asistencia'
  }
);

module.exports = PlanillaAtencion;
