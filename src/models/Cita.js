const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS_CITA = ['Pendiente', 'Programada', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio', 'Falto'];
const TIPOS_ATENCION = ['Primera consulta', 'Sesion de fisioterapia', 'Sesion de tratamiento', 'Evaluacion', 'Control', 'Rehabilitacion', 'Otro'];

const Cita = sequelize.define(
  'Cita',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    usuario_id: DataTypes.INTEGER,
    historia_clinica_id: DataTypes.INTEGER,
    profesional_id: DataTypes.INTEGER,
    sesion_id: DataTypes.INTEGER,
    numero_sesion: DataTypes.INTEGER,
    total_sesiones: DataTypes.INTEGER,
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
    ,
    origen: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'Agenda manual' },
    fecha_programada_original: DataTypes.DATEONLY,
    hora_inicio_original: DataTypes.TIME,
    hora_fin_original: DataTypes.TIME,
    motivo_cambio: DataTypes.TEXT,
    historial_programacion: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }
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
