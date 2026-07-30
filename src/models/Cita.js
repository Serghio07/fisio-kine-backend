const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS_CITA = ['Pendiente', 'Programada', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio', 'Falto'];
const TIPOS_ATENCION = ['Primera consulta', 'Sesion de fisioterapia', 'Sesion de tratamiento', 'Evaluacion', 'Control', 'Rehabilitacion', 'Otro'];
const CANALES_ORIGEN = ['SISTEMA_INTERNO', 'WHATSAPP', 'WEB_WHATSAPP', 'OTRO'];
const ESTADOS_CONFIRMACION = ['PENDIENTE', 'CONFIRMADA', 'SIN_RESPUESTA', 'RECHAZADA'];

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
    ,
    canal_origen: { type: DataTypes.STRING(30), validate: { isIn: [CANALES_ORIGEN] } },
    referencia_origen: DataTypes.STRING(100),
    estado_confirmacion: { type: DataTypes.STRING(30), validate: { isIn: [ESTADOS_CONFIRMACION] } },
    fecha_confirmacion: DataTypes.DATE,
    whatsapp_message_id: DataTypes.STRING(255),
    whatsapp_conversation_id: DataTypes.INTEGER,
    reserva_temporal_id: DataTypes.INTEGER,
    paciente_verificado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    metodo_verificacion: DataTypes.STRING(50),
    fecha_ultima_notificacion: DataTypes.DATE,
    motivo_reprogramacion: DataTypes.TEXT,
    canal_cancelacion: DataTypes.STRING(30),
    fecha_cancelacion: DataTypes.DATE
  },
  {
    tableName: 'citas'
  }
);

module.exports = {
  Cita,
  ESTADOS_CITA,
  TIPOS_ATENCION,
  CANALES_ORIGEN,
  ESTADOS_CONFIRMACION
};
