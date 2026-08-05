const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const REPLY_TYPES = Object.freeze(['TEXTO_LIBRE', 'PLANTILLA']);
const REPLY_STATES = Object.freeze(['PENDIENTE_CONFIRMACION', 'PROCESANDO', 'ACEPTADO_META', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'REINTENTO', 'FALLIDO', 'CANCELADO', 'EXPIRADO']);

const WhatsappReceptionReply = sequelize.define('WhatsappReceptionReply', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  derivacion_id: { type: DataTypes.BIGINT, allowNull: false }, usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  telefono_normalizado: { type: DataTypes.STRING(15), allowNull: false },
  tipo_envio: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [REPLY_TYPES] } },
  mensaje_texto: DataTypes.STRING(1000), plantilla_nombre: DataTypes.STRING(255), plantilla_idioma: DataTypes.STRING(20),
  parametros_plantilla: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  estado: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'PENDIENTE_CONFIRMACION', validate: { isIn: [REPLY_STATES] } },
  intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, expira_en: { type: DataTypes.DATE, allowNull: false },
  confirmado_en: DataTypes.DATE, ultimo_intento_en: DataTypes.DATE, proximo_intento_en: DataTypes.DATE,
  aceptado_en: DataTypes.DATE, enviado_en: DataTypes.DATE, entregado_en: DataTypes.DATE, leido_en: DataTypes.DATE, fallido_en: DataTypes.DATE,
  meta_message_id: { type: DataTypes.STRING(255), unique: true }, idempotency_key: { type: DataTypes.STRING(128), allowNull: false, unique: true },
  error_codigo: DataTypes.STRING(100), error_categoria: DataTypes.STRING(50), error_resumen: DataTypes.STRING(500)
}, { tableName: 'whatsapp_respuestas_recepcion', createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = { WhatsappReceptionReply, REPLY_TYPES, REPLY_STATES };
