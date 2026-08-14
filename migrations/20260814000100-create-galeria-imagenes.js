'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('galeria_imagenes', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      titulo: { type: DataTypes.STRING(180), allowNull: false },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
      imagen: { type: DataTypes.STRING(500), allowNull: false },
      categoria: { type: DataTypes.ENUM('Instalaciones', 'Equipamiento', 'Tratamientos', 'Especialistas'), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      estado: { type: DataTypes.ENUM('PUBLICADO', 'NO_PUBLICADO'), allowNull: false, defaultValue: 'NO_PUBLICADO' },
      creado_por_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      modificado_por_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addIndex('galeria_imagenes', ['estado', 'orden', 'id'], { name: 'galeria_imagenes_publicacion_orden_idx' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('galeria_imagenes');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_galeria_imagenes_categoria"; DROP TYPE IF EXISTS "enum_galeria_imagenes_estado";');
  }
};
