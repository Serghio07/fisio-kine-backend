const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TareaPersonal = sequelize.define('TareaPersonal', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  personal_id: DataTypes.INTEGER,
  asignado_usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  usuario_id: DataTypes.INTEGER,
  titulo: { type: DataTypes.STRING(180), allowNull: false },
  descripcion: DataTypes.TEXT,
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  hora: DataTypes.TIME,
  prioridad: {
    type: DataTypes.STRING(15),
    allowNull: false,
    defaultValue: 'media',
    validate: { isIn: [['baja', 'media', 'alta']] }
  },
  estado: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'pendiente',
    validate: { isIn: [['pendiente', 'en_progreso', 'completada', 'cancelada']] }
  }
}, { tableName: 'tareas_personal' });

module.exports = TareaPersonal;
