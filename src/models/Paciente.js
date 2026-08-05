const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { normalizePhoneNumber } = require('../utils/phone');

const Paciente = sequelize.define(
  'Paciente',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombres: { type: DataTypes.STRING(150), allowNull: false },
    apellidos: { type: DataTypes.STRING(150), allowNull: false },
    ci: { type: DataTypes.STRING(30), allowNull: true, unique: true },
    fecha_nacimiento: DataTypes.DATEONLY,
    lugar_nacimiento: DataTypes.STRING(150),
    edad: DataTypes.INTEGER,
    sexo: { type: DataTypes.STRING(10), allowNull: true, validate: { isIn: [['MASCULINO', 'FEMENINO']] } },
    telefono: { type: DataTypes.STRING(30), allowNull: false },
    telefono_normalizado: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: 'pacientes_telefono_normalizado_unique',
      validate: { is: /^\d{7,15}$/ }
    },
    foto: DataTypes.TEXT,
    peso: DataTypes.DECIMAL(5, 2),
    talla: DataTypes.DECIMAL(5, 2),
    imc: DataTypes.DECIMAL(5, 2),
    domicilio: DataTypes.TEXT,
    estado_civil: DataTypes.STRING(50),
    ocupacion: DataTypes.STRING(120),
    referencia: DataTypes.TEXT,
    estado: { type: DataTypes.BOOLEAN, defaultValue: true },
    registro_pendiente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
  },
  {
    tableName: 'pacientes',
    hooks: {
      beforeValidate: (paciente) => {
        if (paciente.changed('telefono') || !paciente.telefono_normalizado) {
          paciente.telefono_normalizado = normalizePhoneNumber(paciente.telefono);
        }
      }
    }
  }
);

const pacienteToJSON = Paciente.prototype.toJSON;
Paciente.prototype.toJSON = function toJSON() {
  const value = pacienteToJSON.call(this);
  delete value.telefono_normalizado;
  return value;
};

module.exports = Paciente;
