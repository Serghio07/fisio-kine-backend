const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Paciente = sequelize.define(
  'Paciente',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombres: { type: DataTypes.STRING(150), allowNull: false },
    apellidos: DataTypes.STRING(150),
    ci: DataTypes.STRING(30),
    fecha_nacimiento: DataTypes.DATEONLY,
    edad: DataTypes.INTEGER,
    sexo: { type: DataTypes.ENUM('M', 'F', 'Otro'), validate: { isIn: [['M', 'F', 'Otro']] } },
    telefono: DataTypes.STRING(30),
    domicilio: DataTypes.TEXT,
    estado_civil: DataTypes.STRING(50),
    ocupacion: DataTypes.STRING(120),
    referencia: DataTypes.TEXT,
    estado: { type: DataTypes.BOOLEAN, defaultValue: true }
  },
  { tableName: 'pacientes' }
);

module.exports = Paciente;
