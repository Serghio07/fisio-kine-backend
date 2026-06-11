const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HistoriaClinica = sequelize.define(
  'HistoriaClinica',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    usuario_id: DataTypes.INTEGER,
    fecha_evaluacion: { type: DataTypes.DATEONLY, allowNull: false },
    lugar_fecha_nacimiento: DataTypes.TEXT,
    peso: DataTypes.DECIMAL(5, 2),
    talla: DataTypes.DECIMAL(5, 2),
    imc: DataTypes.DECIMAL(5, 2),
    diagnostico_medico: DataTypes.TEXT,
    motivo_consulta: DataTypes.TEXT,
    enfermedad_actual: DataTypes.TEXT,
    profesional_cargo: DataTypes.STRING(150),
    estado: { type: DataTypes.ENUM('activa', 'cerrada', 'anulada'), defaultValue: 'activa' }
  },
  { tableName: 'historias_clinicas' }
);

module.exports = HistoriaClinica;
