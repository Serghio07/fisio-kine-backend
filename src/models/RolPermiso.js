const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RolPermiso = sequelize.define('RolPermiso', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  rol: { type: DataTypes.STRING(30), allowNull: false },
  modulo: { type: DataTypes.STRING(80), allowNull: false },
  acciones: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  actualizado_por_id: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'roles_permisos',
  indexes: [{ unique: true, fields: ['rol', 'modulo'] }]
});

module.exports = RolPermiso;
