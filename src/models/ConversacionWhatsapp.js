const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConversacionWhatsapp = sequelize.define('ConversacionWhatsapp', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  telefono: { type: DataTypes.STRING(30), allowNull: false },
  paciente_id: DataTypes.INTEGER,
  origen_conversacion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'WHATSAPP' },
  referencia_origen: DataTypes.STRING(100),
  estado_flujo: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'INICIADA' },
  ultimo_paso: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'BIENVENIDA' },
  datos_temporales: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  intentos_verificacion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  fecha_inicio: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  fecha_ultima_interaccion: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  estado: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'ACTIVA' }
}, {
  tableName: 'conversaciones_whatsapp'
});

module.exports = ConversacionWhatsapp;
