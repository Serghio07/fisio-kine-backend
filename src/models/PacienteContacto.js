const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PARENTESCOS_CONTACTO = [
  'PADRE', 'MADRE', 'TUTOR_LEGAL', 'ABUELO', 'ABUELA',
  'HERMANO', 'HERMANA', 'CUIDADOR', 'APODERADO', 'OTRO'
];

const PacienteContacto = sequelize.define('PacienteContacto', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paciente_id: { type: DataTypes.INTEGER, allowNull: false },
  contacto_id: { type: DataTypes.INTEGER, allowNull: false },
  parentesco: { type: DataTypes.STRING(30), allowNull: false, validate: { isIn: [PARENTESCOS_CONTACTO] } },
  parentesco_otro: DataTypes.STRING(100),
  es_contacto_principal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  es_responsable_legal: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  recibe_recordatorios: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  puede_gestionar_citas: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  autoriza_whatsapp: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  prioridad: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1, validate: { min: 1 } },
  estado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
  fecha_fin: DataTypes.DATEONLY,
  observaciones: DataTypes.TEXT
}, {
  tableName: 'paciente_contactos'
});

module.exports = { PacienteContacto, PARENTESCOS_CONTACTO };
