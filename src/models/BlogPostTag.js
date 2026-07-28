const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('BlogPostTag', {
  blogPostId: { type: DataTypes.INTEGER, primaryKey: true, field: 'blog_post_id' },
  blogTagId: { type: DataTypes.INTEGER, primaryKey: true, field: 'blog_tag_id' }
}, {
  tableName: 'blog_post_tags',
  timestamps: false
});
