const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CondicionActual = sequelize.define(
  'CondicionActual',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    tipo_lesion: DataTypes.STRING(100),
    zona_cuerpo: DataTypes.TEXT,
    estudios_imagenologicos: DataTypes.TEXT,
    descripcion: DataTypes.TEXT
  },
  { tableName: 'condicion_actual', timestamps: false }
);

module.exports = CondicionActual;
