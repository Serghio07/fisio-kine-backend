const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InformeMedico = sequelize.define(
  'InformeMedico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    doctor: DataTypes.STRING(150),
    diagnostico: { type: DataTypes.TEXT, allowNull: false },
    dx_cie: DataTypes.TEXT,
    antecedentes: DataTypes.TEXT,
    conclusion_diagnostica: DataTypes.TEXT,
    cantidad_sesiones: DataTypes.INTEGER,
    tratamiento_fisioterapeutico: DataTypes.TEXT,
    medicamentos: DataTypes.TEXT,
    estado_actual: DataTypes.TEXT,
    observacion_final: DataTypes.TEXT
  },
  {
    tableName: 'informes_medicos'
  }
);

module.exports = InformeMedico;
