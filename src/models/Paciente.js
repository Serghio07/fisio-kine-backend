const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Paciente = sequelize.define(
  'Paciente',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombres: { type: DataTypes.STRING(150), allowNull: false },
    apellidos: { type: DataTypes.STRING(150), allowNull: false },
    ci: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    fecha_nacimiento: DataTypes.DATEONLY,
    lugar_nacimiento: DataTypes.STRING(150),
    edad: DataTypes.INTEGER,
    sexo: { type: DataTypes.STRING(10), allowNull: false, validate: { isIn: [['MASCULINO', 'FEMENINO']] } },
    telefono: { type: DataTypes.STRING(30), allowNull: false },
    foto: DataTypes.TEXT,
    peso: DataTypes.DECIMAL(5, 2),
    talla: DataTypes.DECIMAL(5, 2),
    imc: DataTypes.DECIMAL(5, 2),
    domicilio: DataTypes.TEXT,
    estado_civil: DataTypes.STRING(50),
    ocupacion: DataTypes.STRING(120),
    referencia: DataTypes.TEXT,
    estado: { type: DataTypes.BOOLEAN, defaultValue: true }
  },
  { tableName: 'pacientes' }
);

module.exports = Paciente;
