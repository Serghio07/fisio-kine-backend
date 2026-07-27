require('dotenv').config();

const { sequelize } = require('../models');

const run = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE sesiones
        ADD COLUMN IF NOT EXISTS farmacos JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS observacion_pago TEXT,
        ADD COLUMN IF NOT EXISTS motivo_sin_costo TEXT;

      ALTER TABLE sesiones
        ALTER COLUMN metodo_pago DROP NOT NULL;
    `);
    console.log('Migracion de farmacos por sesion completada.');
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error('No se pudo migrar farmacos por sesion:', error.message);
  process.exitCode = 1;
});
