require('dotenv').config();

const { sequelize } = require('../models');

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE sesiones
        ADD COLUMN IF NOT EXISTS procedimiento VARCHAR(80),
        ADD COLUMN IF NOT EXISTS procedimiento_otro VARCHAR(180);
    `);
    console.log('Migracion de procedimientos por sesion completada.');
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error('No se pudo migrar procedimientos por sesion:', error.message);
  process.exitCode = 1;
});
