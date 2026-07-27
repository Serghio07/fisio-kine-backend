const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HistoriaClinica = sequelize.define(
  'HistoriaClinica',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    usuario_id: DataTypes.INTEGER,
    fecha_evaluacion: { type: DataTypes.DATEONLY, allowNull: false },
    lugar_fecha_nacimiento: DataTypes.TEXT,
    peso: DataTypes.DECIMAL(5, 2),
    talla: DataTypes.DECIMAL(5, 2),
    imc: DataTypes.DECIMAL(5, 2),
    diagnostico_medico: DataTypes.TEXT,
    motivo_consulta: DataTypes.TEXT,
    enfermedad_actual: DataTypes.TEXT,
    profesional_cargo: DataTypes.STRING(150),
    // Se conserva el atributo de API `evolutivo` por compatibilidad,
    // pero la columna física usa la terminología clínica correcta.
    evolutivo: { type: DataTypes.JSONB, allowNull: false, defaultValue: [], field: 'evoluciones' },
    anulada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    anulada_en: DataTypes.DATE,
    anulada_por: DataTypes.STRING(150),
    motivo_anulacion: DataTypes.STRING(120),
    observacion_anulacion: DataTypes.TEXT,
    restaurada_en: DataTypes.DATE,
    restaurada_por: DataTypes.STRING(150),
    estado: { type: DataTypes.STRING(10), defaultValue: 'borrador', validate: { isIn: [['borrador', 'activa', 'anulada']] } }
  },
  { tableName: 'historias_clinicas' }
);

module.exports = HistoriaClinica;
