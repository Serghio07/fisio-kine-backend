const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GoogleCalendarIntegracion = sequelize.define('GoogleCalendarIntegracion', {
  id: { type: DataTypes.SMALLINT, primaryKey: true, defaultValue: 1, validate: { isIn: [[1]] } },
  access_token_cifrado: { type: DataTypes.TEXT, allowNull: true },
  refresh_token_cifrado: { type: DataTypes.TEXT, allowNull: false },
  expiry_date: { type: DataTypes.BIGINT, allowNull: true },
  calendar_id: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'primary' }
}, { tableName: 'google_calendar_integraciones' });

module.exports = GoogleCalendarIntegracion;
