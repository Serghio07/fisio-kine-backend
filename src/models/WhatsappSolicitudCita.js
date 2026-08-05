const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS_SOLICITUD_WHATSAPP = [
  'AGENDAR',
  'REPROGRAMAR',
  'CANCELAR',
  'CONFIRMAR_ASISTENCIA',
  'SOLICITAR_ATENCION_PERSONAL'
];

const ESTADOS_SOLICITUD_WHATSAPP = [
  'INICIADA',
  'EN_PROCESO',
  'PENDIENTE_CONFIRMACION',
  'CONFIRMADA',
  'COMPLETADA',
  'CANCELADA',
  'EXPIRADA',
  'DERIVADA_PERSONAL',
  'ERROR'
];

const validarObjetoJson = (valor) => {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('datos_temporales debe ser un objeto JSON');
  }
};

const WhatsappSolicitudCita = sequelize.define(
  'WhatsappSolicitudCita',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
    telefono: { type: DataTypes.STRING(30), allowNull: false },
    nombre_whatsapp: { type: DataTypes.STRING(150), allowNull: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: true },
    cita_id: { type: DataTypes.INTEGER, allowNull: true },
    tipo_solicitud: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { isIn: [TIPOS_SOLICITUD_WHATSAPP] }
    },
    estado: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'INICIADA',
      validate: { isIn: [ESTADOS_SOLICITUD_WHATSAPP] }
    },
    paso_actual: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'INICIO' },
    datos_temporales: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      validate: { esObjetoJson: validarObjetoJson }
    },
    motivo: { type: DataTypes.TEXT, allowNull: true },
    fecha_solicitada: { type: DataTypes.DATEONLY, allowNull: true },
    hora_inicio: { type: DataTypes.TIME, allowNull: true },
    hora_fin: { type: DataTypes.TIME, allowNull: true },
    confirmacion: { type: DataTypes.BOOLEAN, allowNull: true },
    intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    confirmada_en: { type: DataTypes.DATE, allowNull: true },
    cancelada_en: { type: DataTypes.DATE, allowNull: true },
    motivo_cancelacion: { type: DataTypes.TEXT, allowNull: true },
    ultimo_evento_en: { type: DataTypes.DATE, allowNull: true },
    expira_en: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: 'whatsapp_solicitudes_cita',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    validate: {
      horasCoherentes() {
        if (this.hora_fin && (!this.hora_inicio || this.hora_fin <= this.hora_inicio)) {
          throw new Error('hora_fin debe ser posterior a hora_inicio');
        }
      }
    }
  }
);

module.exports = {
  WhatsappSolicitudCita,
  TIPOS_SOLICITUD_WHATSAPP,
  ESTADOS_SOLICITUD_WHATSAPP
};
