const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ActividadSistema = sequelize.define(
  'ActividadSistema',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    paciente_id: DataTypes.INTEGER,
    entidad_id: DataTypes.INTEGER,
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    hora: { type: DataTypes.TIME, allowNull: false },
    modulo: { type: DataTypes.STRING(80), allowNull: false },
    accion: { type: DataTypes.STRING(30), allowNull: false },
    detalle: DataTypes.STRING(500),
    datos: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    metodo: { type: DataTypes.STRING(10), allowNull: false },
    ruta: { type: DataTypes.STRING(255), allowNull: false }
  },
  { tableName: 'actividades_sistema', updatedAt: false }
);

module.exports = ActividadSistema;
