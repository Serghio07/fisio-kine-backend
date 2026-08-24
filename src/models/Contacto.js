const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CONTACT_DOCUMENT_TYPES = ['CI', 'DNI', 'PASAPORTE', 'CEDULA', 'CARNET_EXTRANJERIA', 'OTRO'];

const Contacto = sequelize.define('Contacto', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombres: { type: DataTypes.STRING(150), allowNull: false },
  apellidos: { type: DataTypes.STRING(150), allowNull: false },
  telefono: { type: DataTypes.STRING(30), allowNull: false },
  telefono_normalizado: { type: DataTypes.STRING(15), allowNull: false, validate: { is: /^\d{7,15}$/ } },
  tipo_documento: { type: DataTypes.STRING(30), allowNull: true, validate: { isIn: [CONTACT_DOCUMENT_TYPES] } },
  numero_documento: DataTypes.STRING(50),
  numero_documento_normalizado: DataTypes.STRING(50),
  nombre_documento_otro: DataTypes.STRING(100),
  paciente_id: DataTypes.INTEGER,
  estado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'contactos'
});

module.exports = { Contacto, CONTACT_DOCUMENT_TYPES };
