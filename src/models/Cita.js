const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS_CITA = ['Pendiente', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio'];
const TIPOS_ATENCION = ['Primera consulta', 'Sesion de fisioterapia', 'Evaluacion', 'Control', 'Rehabilitacion', 'Otro'];

const Cita = sequelize.define(
  'Cita',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    hora_inicio: { type: DataTypes.TIME, allowNull: false },
    hora_fin: DataTypes.TIME,
    motivo: DataTypes.STRING(255),
    tipo_atencion: {
      type: DataTypes.STRING(100),
      validate: {
        isIn: [TIPOS_ATENCION]
      }
    },
    estado: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Pendiente',
      validate: {
        isIn: [ESTADOS_CITA]
      }
    },
    observacion: DataTypes.TEXT
  },
  {
    tableName: 'citas'
  }
);

module.exports = {
  Cita,
  ESTADOS_CITA,
  TIPOS_ATENCION
};
