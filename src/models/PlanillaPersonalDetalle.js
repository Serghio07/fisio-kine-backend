const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PlanillaPersonalDetalle = sequelize.define(
  'PlanillaPersonalDetalle',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    planilla_id: { type: DataTypes.INTEGER, allowNull: false },
    personal_id: DataTypes.INTEGER,
    numero: { type: DataTypes.INTEGER, allowNull: false },
    apellido_paterno: { type: DataTypes.STRING(100), allowNull: false },
    apellido_materno: DataTypes.STRING(100),
    nombres: { type: DataTypes.STRING(150), allowNull: false },
    ci: DataTypes.STRING(30),
    cargo: DataTypes.STRING(120),
    horario: DataTypes.STRING(255),
    sueldo_base: DataTypes.DECIMAL(10, 2),
    tipo_pago: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'mensual',
      validate: { isIn: [['mensual', 'por_servicio']] }
    }
  },
  { tableName: 'planillas_personal_detalle', timestamps: false }
);

module.exports = PlanillaPersonalDetalle;
