const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ESTADOS_BLOG = ['BORRADOR', 'PUBLICADO', 'OCULTO', 'ARCHIVADO'];

const BlogPost = sequelize.define('BlogPost', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  slug: { type: DataTypes.STRING(200), allowNull: false, unique: true },
  resumen: { type: DataTypes.TEXT, allowNull: true },
  contenido: { type: DataTypes.TEXT, allowNull: true },
  imagenPortada: { type: DataTypes.STRING(500), allowNull: true, field: 'imagen_portada' },
  imagenAlt: { type: DataTypes.STRING(220), allowNull: true, field: 'imagen_alt' },
  categoriaId: { type: DataTypes.INTEGER, allowNull: true, field: 'categoria_id' },
  autorId: { type: DataTypes.INTEGER, allowNull: false, field: 'autor_id' },
  modificadoPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'modificado_por_id' },
  estado: { type: DataTypes.ENUM(...ESTADOS_BLOG), allowNull: false, defaultValue: 'BORRADOR' },
  destacado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  fechaPublicacion: { type: DataTypes.DATE, allowNull: true, field: 'fecha_publicacion' },
  publicadoPorId: { type: DataTypes.INTEGER, allowNull: true, field: 'publicado_por_id' },
  fechaOcultamiento: { type: DataTypes.DATE, allowNull: true, field: 'fecha_ocultamiento' },
  seoTitulo: { type: DataTypes.STRING(180), allowNull: true, field: 'seo_titulo' },
  seoDescripcion: { type: DataTypes.STRING(320), allowNull: true, field: 'seo_descripcion' },
  palabrasClave: { type: DataTypes.STRING(500), allowNull: true, field: 'palabras_clave' },
  tiempoLectura: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'tiempo_lectura' }
}, {
  tableName: 'blog_posts',
  paranoid: true,
  deletedAt: 'deleted_at'
});

BlogPost.ESTADOS = ESTADOS_BLOG;
module.exports = BlogPost;
