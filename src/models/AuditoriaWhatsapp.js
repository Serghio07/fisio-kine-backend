const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditoriaWhatsapp = sequelize.define('AuditoriaWhatsapp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  conversacion_id: DataTypes.INTEGER,
  paciente_id: DataTypes.INTEGER,
  cita_id: DataTypes.INTEGER,
  accion: { type: DataTypes.STRING(80), allowNull: false },
  canal: DataTypes.STRING(30),
  estado_anterior: DataTypes.STRING(60),
  estado_nuevo: DataTypes.STRING(60),
  proceso: { type: DataTypes.STRING(80), allowNull: false },
  message_id_externo: DataTypes.STRING(255),
  resultado: { type: DataTypes.STRING(30), allowNull: false },
  error_resumido: DataTypes.STRING(500),
  datos: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'auditoria_whatsapp',
  timestamps: false
});

module.exports = AuditoriaWhatsapp;
