const { Sequelize } = require('sequelize');
require('dotenv').config();
const { BOLIVIA_TIME_ZONE, BOLIVIA_UTC_OFFSET } = require('../utils/boliviaDateTime');

process.env.TZ = process.env.TZ || BOLIVIA_TIME_ZONE;

const sequelize = new Sequelize(
  process.env.DB_NAME || 'fisio_kine_db',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || 'postgres',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    timezone: BOLIVIA_UTC_OFFSET,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    hooks: {
      afterConnect: async (connection) => {
        await connection.query(`SET TIME ZONE '${BOLIVIA_TIME_ZONE}'`);
      }
    },
    define: {
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    }
  }
);

module.exports = sequelize;
