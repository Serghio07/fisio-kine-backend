const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const Usuario = sequelize.define(
  'Usuario',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING(120), allowNull: false },
    usuario: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(120), unique: true, validate: { isEmail: true } },
    telefono: { type: DataTypes.STRING(30), allowNull: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    rol: {
      type: DataTypes.ENUM('admin', 'personal'),
      allowNull: false,
      defaultValue: 'personal'
    },
    estado: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'activo',
      validate: {
        isIn: [['pendiente', 'activo', 'inactivo', 'bloqueado', 'rechazado']]
      }
    },
    activo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    intentos_fallidos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    bloqueado_hasta: DataTypes.DATE,
    ultimo_acceso: DataTypes.DATE
  },
  {
    tableName: 'usuarios',
    hooks: {
      beforeCreate: async (usuario) => {
        usuario.password = await bcrypt.hash(usuario.password, 10);
      },
      beforeUpdate: async (usuario) => {
        if (usuario.changed('password')) {
          usuario.password = await bcrypt.hash(usuario.password, 10);
        }
      }
    }
  }
);

Usuario.prototype.validarPassword = function validarPassword(password) {
  return bcrypt.compare(password, this.password);
};

Usuario.prototype.toJSON = function toJSON() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = Usuario;
