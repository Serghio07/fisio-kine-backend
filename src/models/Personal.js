const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Personal = sequelize.define(
  'Personal',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    usuario_id: DataTypes.INTEGER,
    apellido_paterno: { type: DataTypes.STRING(100), allowNull: false },
    apellido_materno: DataTypes.STRING(100),
    nombres: { type: DataTypes.STRING(150), allowNull: false },
    ci: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    cargo: { type: DataTypes.STRING(120), allowNull: false },
    dias_trabajo: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    hora_entrada: DataTypes.TIME,
    hora_salida: DataTypes.TIME,
    sueldo_base: DataTypes.DECIMAL(10, 2),
    tipo_pago: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'mensual',
      validate: { isIn: [['mensual', 'por_servicio']] }
    },
    telefono: DataTypes.STRING(30),
    direccion: DataTypes.TEXT,
    fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: false },
    estado: {
      type: DataTypes.STRING(15),
      allowNull: false,
      defaultValue: 'activo',
      validate: { isIn: [['activo', 'inactivo']] }
    },
    observaciones: DataTypes.TEXT
  },
  { tableName: 'personal' }
);

module.exports = Personal;
