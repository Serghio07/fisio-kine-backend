const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sesion = sequelize.define(
  'Sesion',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paciente_id: { type: DataTypes.INTEGER, allowNull: false },
    fecha: { type: DataTypes.DATEONLY, allowNull: false },
    numero_sesion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    sesiones_debe: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 }
    },
    sesiones_hizo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 }
    },
    asistencia: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pendiente',
      validate: {
        isIn: [['pendiente', 'asistio', 'no_asistio', 'cancelada', 'reprogramada']]
      }
    },
    metodo_pago: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pendiente',
      validate: {
        isIn: [['QR', 'Efectivo', 'Transferencia', 'Pendiente']]
      }
    },
    estado_pago: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'Pendiente',
      validate: {
        isIn: [['Pagado', 'Pendiente', 'Parcial']]
      }
    },
    aplica_farmacos: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    observacion_farmacos: DataTypes.TEXT,
    observacion: DataTypes.TEXT
  },
  {
    tableName: 'sesiones',
    updatedAt: false
  }
);

module.exports = Sesion;
