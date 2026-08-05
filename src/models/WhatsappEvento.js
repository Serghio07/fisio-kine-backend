const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DIRECCIONES_WHATSAPP_EVENTO = ['ENTRANTE', 'SALIENTE', 'SISTEMA'];

const TIPOS_WHATSAPP_EVENTO = [
  'MENSAJE_RECIBIDO',
  'MENSAJE_PROCESADO',
  'MENSAJE_DUPLICADO',
  'CONFIRMACION_ENVIADA',
  'RECORDATORIO_ENVIADO',
  'ESTADO_ENTREGA',
  'ERROR_ENVIO',
  'CITA_CONFIRMADA',
  'CITA_CANCELADA',
  'CITA_REPROGRAMADA'
];

const ESTADOS_WHATSAPP_EVENTO = [
  'RECIBIDO',
  'PROCESADO',
  'DUPLICADO',
  'ENVIADO',
  'ENTREGADO',
  'LEIDO',
  'FALLIDO'
];

const validarObjetoJson = (valor) => {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error('datos debe ser un objeto JSON');
  }
};

const WhatsappEvento = sequelize.define(
  'WhatsappEvento',
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
    meta_message_id: { type: DataTypes.STRING(255), allowNull: true },
    solicitud_id: { type: DataTypes.INTEGER, allowNull: true },
    cita_id: { type: DataTypes.INTEGER, allowNull: true },
    telefono: { type: DataTypes.STRING(30), allowNull: false },
    direccion: {
      type: DataTypes.STRING(10),
      allowNull: false,
      validate: { isIn: [DIRECCIONES_WHATSAPP_EVENTO] }
    },
    tipo_evento: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { isIn: [TIPOS_WHATSAPP_EVENTO] }
    },
    estado: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'RECIBIDO',
      validate: { isIn: [ESTADOS_WHATSAPP_EVENTO] }
    },
    error_codigo: { type: DataTypes.STRING(100), allowNull: true },
    error_detalle: { type: DataTypes.TEXT, allowNull: true },
    datos: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      validate: { esObjetoJson: validarObjetoJson }
    },
    procesado_en: { type: DataTypes.DATE, allowNull: true },
    enviado_en: { type: DataTypes.DATE, allowNull: true },
    entregado_en: { type: DataTypes.DATE, allowNull: true },
    leido_en: { type: DataTypes.DATE, allowNull: true }
  },
  {
    tableName: 'whatsapp_eventos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

module.exports = {
  WhatsappEvento,
  DIRECCIONES_WHATSAPP_EVENTO,
  TIPOS_WHATSAPP_EVENTO,
  ESTADOS_WHATSAPP_EVENTO
};
