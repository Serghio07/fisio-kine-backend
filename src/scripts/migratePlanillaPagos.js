require('dotenv').config();
const { sequelize } = require('../models');

async function migrate() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });
    console.log('Tablas del módulo Planilla de pagos creadas correctamente.');
    console.log('La vinculación histórica de sesiones se realizará al abrir el módulo por primera vez.');
  } catch (error) {
    console.error('No se pudo crear el módulo Planilla de pagos:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
