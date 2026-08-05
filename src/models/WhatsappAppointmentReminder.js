const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const REMINDER_STATES = Object.freeze(['PENDIENTE', 'PROCESANDO', 'ACEPTADO', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'REINTENTO', 'FALLIDO', 'CANCELADO', 'RESPONDIDO', 'EXPIRADO']);
const REMINDER_RESPONSES = Object.freeze(['CONFIRMAR_ASISTENCIA', 'NO_ASISTIRA', 'CANCELAR_CITA', 'REPROGRAMAR', 'MANTENER_CITA', 'RECEPCION']);

const WhatsappAppointmentReminder = sequelize.define('WhatsappAppointmentReminder', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  cita_id: { type: DataTypes.INTEGER, allowNull: false }, paciente_id: { type: DataTypes.INTEGER, allowNull: false },
  telefono_normalizado: { type: DataTypes.STRING(15), allowNull: false }, tipo_recordatorio: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'CITA_PROXIMA' },
  programado_para: { type: DataTypes.DATE, allowNull: false }, cita_fecha: { type: DataTypes.DATEONLY, allowNull: false },
  cita_hora_inicio: { type: DataTypes.TIME, allowNull: false }, cita_hora_fin: DataTypes.TIME, cita_estado: { type: DataTypes.STRING(50), allowNull: false },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PENDIENTE', validate: { isIn: [REMINDER_STATES] } },
  intentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, ultimo_intento_en: DataTypes.DATE, proximo_intento_en: DataTypes.DATE,
  aceptado_en: DataTypes.DATE, enviado_en: DataTypes.DATE, entregado_en: DataTypes.DATE, leido_en: DataTypes.DATE,
  expira_respuesta_en: DataTypes.DATE, respondido_en: DataTypes.DATE, meta_message_id: DataTypes.STRING(255),
  idempotency_key: { type: DataTypes.STRING(255), allowNull: false, unique: true }, respuesta: { type: DataTypes.STRING(40), validate: { isIn: [[...REMINDER_RESPONSES, null]] } },
  error_codigo: DataTypes.STRING(100), error_categoria: DataTypes.STRING(20), error_resumen: DataTypes.STRING(500)
}, { tableName: 'whatsapp_recordatorios_cita', createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = { WhatsappAppointmentReminder, REMINDER_STATES, REMINDER_RESPONSES };
