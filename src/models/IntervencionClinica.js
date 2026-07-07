const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const IntervencionClinica = sequelize.define(
  'IntervencionClinica',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    escala_dolor: { type: DataTypes.INTEGER, validate: { min: 0, max: 10 } },
    tono: DataTypes.TEXT,
    goniometria_balance_articular: DataTypes.TEXT,
    balance_muscular: DataTypes.TEXT,
    trofismo: { type: DataTypes.STRING(20), validate: { isIn: [['CONSERVADO', 'DISMINUIDO', 'AUMENTADO']] } },
    detalle_trofismo: DataTypes.TEXT,
    observaciones: DataTypes.TEXT
  },
  { tableName: 'intervencion_clinica', timestamps: false }
);

module.exports = IntervencionClinica;
