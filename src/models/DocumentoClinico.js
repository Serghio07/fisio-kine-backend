const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DocumentoClinico = sequelize.define(
  'DocumentoClinico',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tipo: {
      type: DataTypes.STRING(40),
      allowNull: false,
      validate: { isIn: [['consentimiento', 'signos_vitales', 'farmacos']] }
    },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    usuario_id: DataTypes.INTEGER,
    usuario_modificacion_id: DataTypes.INTEGER,
    sesion_id: DataTypes.INTEGER,
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    estado: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Guardado',
      validate: { isIn: [['Borrador', 'Guardado', 'Finalizado', 'Anulado']] }
    },
    titulo: DataTypes.STRING(180),
    descripcion: DataTypes.TEXT,
    datos: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    eliminado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_eliminacion: DataTypes.DATE,
    usuario_eliminacion_id: DataTypes.INTEGER
  },
  {
    tableName: 'documentos_clinicos'
  }
);

module.exports = DocumentoClinico;
