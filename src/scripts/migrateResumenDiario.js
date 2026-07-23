require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });
    console.log('Tabla de observaciones del Resumen diario creada correctamente.');
  } catch (error) {
    console.error('No se pudo migrar el Resumen diario:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
