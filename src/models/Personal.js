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
    titulo_profesional: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: { isIn: [['Doc.', 'Dr.', 'Dra.', 'Lic.', 'Sr.', 'Sra.']] }
    },
    cargo: { type: DataTypes.STRING(120), allowNull: false },
    nombre_mostrado: {
      type: DataTypes.VIRTUAL,
      get() {
        const nombreCompleto = [this.getDataValue('nombres'), this.getDataValue('apellido_paterno'), this.getDataValue('apellido_materno')]
          .filter(Boolean)
          .join(' ');
        return [this.getDataValue('titulo_profesional'), this.getDataValue('cargo'), nombreCompleto]
          .filter(Boolean)
          .join(' ');
      }
    },
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
