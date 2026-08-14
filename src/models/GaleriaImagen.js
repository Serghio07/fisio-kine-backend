const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CATEGORIAS_GALERIA = ['Instalaciones', 'Equipamiento', 'Tratamientos', 'Especialistas'];
const ESTADOS_GALERIA = ['PUBLICADO', 'NO_PUBLICADO'];

const GaleriaImagen = sequelize.define('GaleriaImagen', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  imagen: { type: DataTypes.STRING(500), allowNull: false },
  categoria: { type: DataTypes.ENUM(...CATEGORIAS_GALERIA), allowNull: false },
  orden: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  estado: { type: DataTypes.ENUM(...ESTADOS_GALERIA), allowNull: false, defaultValue: 'NO_PUBLICADO' },
  creadoPorId: { type: DataTypes.INTEGER, allowNull: false, field: 'creado_por_id' },
  modificadoPorId: { type: DataTypes.INTEGER, allowNull: false, field: 'modificado_por_id' }
}, { tableName: 'galeria_imagenes' });

GaleriaImagen.CATEGORIAS = CATEGORIAS_GALERIA;
GaleriaImagen.ESTADOS = ESTADOS_GALERIA;
module.exports = GaleriaImagen;
