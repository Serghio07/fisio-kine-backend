const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('BlogCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'blog_categories',
  paranoid: true,
  deletedAt: 'deleted_at'
});
