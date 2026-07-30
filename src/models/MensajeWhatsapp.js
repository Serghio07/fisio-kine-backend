const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MensajeWhatsapp = sequelize.define('MensajeWhatsapp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  conversacion_id: { type: DataTypes.INTEGER, allowNull: false },
  paciente_id: DataTypes.INTEGER,
  cita_id: DataTypes.INTEGER,
  message_id_externo: { type: DataTypes.STRING(255), unique: true },
  direccion: { type: DataTypes.STRING(15), allowNull: false },
  tipo: { type: DataTypes.STRING(40), allowNull: false },
  contenido_resumido: DataTypes.STRING(500),
  estado_envio: DataTypes.STRING(30),
  fecha_recepcion: DataTypes.DATE,
  fecha_envio: DataTypes.DATE,
  fecha_entrega: DataTypes.DATE,
  fecha_lectura: DataTypes.DATE,
  fecha_error: DataTypes.DATE,
  codigo_error: DataTypes.STRING(80),
  error_resumido: DataTypes.STRING(500),
  respuesta_api_resumida: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  reintentos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  tableName: 'mensajes_whatsapp'
});

module.exports = MensajeWhatsapp;
