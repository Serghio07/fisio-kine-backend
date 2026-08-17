const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NOTIFICATION_TYPES = Object.freeze(['NUEVA_DERIVACION', 'DERIVACION_ASIGNADA', 'RESPUESTA_PACIENTE', 'ENVIO_WHATSAPP_FALLIDO', 'DERIVACION_PENDIENTE_VENCIDA', 'CITA_PROXIMA']);
const NOTIFICATION_STATES = Object.freeze(['NO_LEIDA', 'LEIDA']);
const NOTIFICATION_PRIORITIES = Object.freeze(['BAJA', 'NORMAL', 'ALTA']);
const NOTIFICATION_ENTITIES = Object.freeze(['DERIVACION_WHATSAPP', 'RESPUESTA_RECEPCION_WHATSAPP', 'CITA_AGENDA']);

const InternalNotification = sequelize.define('InternalNotification', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  tipo: { type: DataTypes.STRING(50), allowNull: false, validate: { isIn: [NOTIFICATION_TYPES] } },
  titulo: { type: DataTypes.STRING(120), allowNull: false }, mensaje: { type: DataTypes.STRING(300), allowNull: false },
  entidad_tipo: { type: DataTypes.STRING(40), allowNull: false, validate: { isIn: [NOTIFICATION_ENTITIES] } },
  entidad_id: { type: DataTypes.BIGINT, allowNull: false }, derivacion_id: DataTypes.BIGINT, respuesta_recepcion_id: DataTypes.BIGINT,
  prioridad: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'NORMAL', validate: { isIn: [NOTIFICATION_PRIORITIES] } },
  estado: { type: DataTypes.STRING(15), allowNull: false, defaultValue: 'NO_LEIDA', validate: { isIn: [NOTIFICATION_STATES] } },
  leida_en: DataTypes.DATE, idempotency_key: { type: DataTypes.STRING(255), allowNull: false, unique: true }
}, { tableName: 'notificaciones_internas', createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = { InternalNotification, NOTIFICATION_TYPES, NOTIFICATION_STATES, NOTIFICATION_PRIORITIES, NOTIFICATION_ENTITIES };
