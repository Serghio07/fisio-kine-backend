const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('BlogTag', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true }
}, {
  tableName: 'blog_tags'
});
