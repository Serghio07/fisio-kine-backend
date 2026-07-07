require('dotenv').config();

const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE personal
        ADD COLUMN IF NOT EXISTS titulo_profesional VARCHAR(10)
    `);
    await sequelize.query(`
      ALTER TABLE personal
        DROP CONSTRAINT IF EXISTS personal_titulo_profesional_check
    `);
    await sequelize.query(`
      ALTER TABLE personal
        ADD CONSTRAINT personal_titulo_profesional_check
        CHECK (
          titulo_profesional IS NULL
          OR titulo_profesional IN ('Doc.', 'Dr.', 'Dra.', 'Lic.', 'Sr.', 'Sra.')
        )
    `);
    console.log('Titulo profesional habilitado para el personal.');
  } catch (error) {
    console.error('No se pudo migrar titulo profesional:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

migrate();
