require('dotenv').config();

const environment = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  dialect: 'postgres',
  logging: false
};

module.exports = {
  development: { ...environment },
  test: { ...environment },
  production: { ...environment }
};
