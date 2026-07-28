require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    const sql = fs.readFileSync(path.join(__dirname, '../../docs/programacion-sesiones-migration.sql'), 'utf8');
    await sequelize.query(sql);
    const columns = await sequelize.getQueryInterface().describeTable('citas');
    const required = ['historia_clinica_id', 'profesional_id', 'numero_sesion', 'origen', 'historial_programacion'];
    const missing = required.filter((column) => !columns[column]);
    if (missing.length) throw new Error(`Faltan columnas despues de migrar: ${missing.join(', ')}`);
    console.log('Migracion de programacion de sesiones aplicada y verificada correctamente.');
  } catch (error) {
    console.error('No se pudo aplicar la migracion:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
