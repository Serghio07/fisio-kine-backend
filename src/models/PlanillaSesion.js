const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlanillaSesion = sequelize.define(
  'PlanillaSesion',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    planilla_id: { type: DataTypes.INTEGER, allowNull: false },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    numero_sesion: { type: DataTypes.INTEGER, allowNull: false },
    firma_paciente: DataTypes.STRING(180),
    firma_profesional: DataTypes.STRING(180),
    observacion: DataTypes.TEXT
  },
  {
    tableName: 'planilla_sesiones',
    updatedAt: false
  }
);

module.exports = PlanillaSesion;
