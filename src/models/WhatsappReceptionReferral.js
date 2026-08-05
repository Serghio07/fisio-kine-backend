const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const REFERRAL_TYPES = Object.freeze(['CONSULTA_GENERAL', 'REGISTRO_PACIENTE', 'RECORDATORIO_CITA', 'AYUDA_REPROGRAMACION', 'ERROR_DE_DATOS']);
const REFERRAL_STATES = Object.freeze(['PENDIENTE', 'EN_ATENCION', 'RESUELTA', 'CERRADA', 'CANCELADA']);
const REFERRAL_PRIORITIES = Object.freeze(['BAJA', 'NORMAL', 'ALTA', 'URGENTE']);
const WhatsappReceptionReferral = sequelize.define('WhatsappReceptionReferral', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  tipo_derivacion: { type: DataTypes.STRING(40), allowNull: false, validate: { isIn: [REFERRAL_TYPES] } },
  origen: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'WHATSAPP' },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDIENTE', validate: { isIn: [REFERRAL_STATES] } },
  prioridad: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'NORMAL', validate: { isIn: [REFERRAL_PRIORITIES] } },
  telefono_normalizado: { type: DataTypes.STRING(15), allowNull: false },
  paciente_id: DataTypes.INTEGER, cita_id: DataTypes.INTEGER, solicitud_cita_id: DataTypes.INTEGER,
  recordatorio_id: DataTypes.BIGINT, conversacion_id: DataTypes.BIGINT, responsable_usuario_id: DataTypes.INTEGER,
  scope_key: { type: DataTypes.STRING(255), allowNull: false },
  contexto_minimo: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  observacion_recepcion: DataTypes.STRING(500), resolucion: DataTypes.STRING(500),
  historial: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  tomada_en: DataTypes.DATE, resuelta_en: DataTypes.DATE, cerrada_en: DataTypes.DATE
}, { tableName: 'whatsapp_derivaciones_recepcion', createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = { WhatsappReceptionReferral, REFERRAL_TYPES, REFERRAL_STATES, REFERRAL_PRIORITIES };
