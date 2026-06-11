const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AntecedenteFamiliar = sequelize.define(
  'AntecedenteFamiliar',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false },
    diabetes: { type: DataTypes.BOOLEAN, defaultValue: false },
    cancer: { type: DataTypes.BOOLEAN, defaultValue: false },
    hipertension: { type: DataTypes.BOOLEAN, defaultValue: false },
    cardiovascular: { type: DataTypes.BOOLEAN, defaultValue: false },
    asma: { type: DataTypes.BOOLEAN, defaultValue: false },
    trombosis_venosa: { type: DataTypes.BOOLEAN, defaultValue: false },
    congenitos: { type: DataTypes.BOOLEAN, defaultValue: false },
    epilepsia: { type: DataTypes.BOOLEAN, defaultValue: false },
    tuberculosis: { type: DataTypes.BOOLEAN, defaultValue: false },
    tabaquismo: { type: DataTypes.BOOLEAN, defaultValue: false },
    alcoholismo: { type: DataTypes.BOOLEAN, defaultValue: false },
    otros: DataTypes.TEXT
  },
  { tableName: 'antecedentes_familiares', timestamps: false }
);

module.exports = AntecedenteFamiliar;
