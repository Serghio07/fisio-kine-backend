const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TIPOS_ADJUNTO = ['RADIOGRAFIA', 'LABORATORIO', 'RESONANCIA', 'TOMOGRAFIA', 'ECOGRAFIA', 'INFORME_OTRA_CLINICA', 'RECETA_MEDICA', 'CERTIFICADO_MEDICO', 'OTRO'];

const AdjuntoHistoriaClinica = sequelize.define('AdjuntoHistoriaClinica', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paciente_id: { type: DataTypes.INTEGER, allowNull: false },
  historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
  sesion_id: DataTypes.INTEGER,
  tipo_adjunto: { type: DataTypes.STRING(40), allowNull: false, validate: { isIn: [TIPOS_ADJUNTO] } },
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  descripcion: DataTypes.TEXT,
  fecha_documento: DataTypes.DATEONLY,
  archivo: { type: DataTypes.STRING(255), allowNull: false },
  nombre_archivo_original: { type: DataTypes.STRING(255), allowNull: false },
  mime_type: { type: DataTypes.STRING(80), allowNull: false },
  tamano_bytes: { type: DataTypes.BIGINT, allowNull: false },
  creado_por_id: { type: DataTypes.INTEGER, allowNull: false },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  eliminado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  fecha_eliminacion: DataTypes.DATE,
  eliminado_por_id: DataTypes.INTEGER
}, { tableName: 'adjuntos_historia_clinica' });

AdjuntoHistoriaClinica.TIPOS_ADJUNTO = TIPOS_ADJUNTO;
module.exports = AdjuntoHistoriaClinica;
