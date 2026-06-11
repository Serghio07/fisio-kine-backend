const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RegistroSemanal = sequelize.define(
  'RegistroSemanal',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    semana_inicio: { type: DataTypes.DATEONLY, allowNull: false },
    semana_fin: { type: DataTypes.DATEONLY, allowNull: false },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    diagnostico: DataTypes.TEXT,
    telefono: DataTypes.STRING(30),
    edad: DataTypes.INTEGER,
    sexo: DataTypes.ENUM('M', 'F', 'Otro'),
    lunes: DataTypes.STRING(30),
    martes: DataTypes.STRING(30),
    miercoles: DataTypes.STRING(30),
    jueves: DataTypes.STRING(30),
    viernes: DataTypes.STRING(30),
    sabado: DataTypes.STRING(30),
    aplica_farmacos: { type: DataTypes.BOOLEAN, defaultValue: false },
    debe_bs: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    observacion: DataTypes.TEXT
  },
  {
    tableName: 'registro_semanal',
    updatedAt: false
  }
);

module.exports = RegistroSemanal;
