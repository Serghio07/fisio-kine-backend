require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    const sql = fs.readFileSync(path.join(__dirname, '../../docs/blog-publicaciones-migration.sql'), 'utf8');
    await sequelize.query(sql);
    console.log('Migración del módulo Blog y publicaciones aplicada correctamente.');
  } catch (error) {
    console.error('No se pudo aplicar la migración del blog:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
