require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS peso DECIMAL(5, 2)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS talla DECIMAL(5, 2)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS imc DECIMAL(5, 2)');
    await sequelize.query("CREATE UNIQUE INDEX IF NOT EXISTS pacientes_ci_unique ON pacientes (ci) WHERE ci IS NOT NULL AND BTRIM(ci) <> ''");
    await sequelize.query('ALTER TABLE pacientes ALTER COLUMN sexo DROP NOT NULL');
    await sequelize.query(`
      ALTER TABLE pacientes
      ALTER COLUMN sexo TYPE VARCHAR(10)
      USING (
        CASE sexo::text
          WHEN 'M' THEN 'MASCULINO'
          WHEN 'F' THEN 'FEMENINO'
          WHEN 'MASCULINO' THEN 'MASCULINO'
          WHEN 'FEMENINO' THEN 'FEMENINO'
          ELSE NULL
        END
      )
    `);
    await sequelize.query('ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_sexo_check');
    await sequelize.query("ALTER TABLE pacientes ADD CONSTRAINT pacientes_sexo_check CHECK (sexo IN ('MASCULINO', 'FEMENINO'))");

    const columnas = await sequelize.getQueryInterface().describeTable('pacientes');
    console.log({
      lugar_nacimiento: Boolean(columnas.lugar_nacimiento),
      peso: Boolean(columnas.peso),
      talla: Boolean(columnas.talla),
      imc: Boolean(columnas.imc)
    });
  } finally {
    await sequelize.close();
  }
};

migrate().catch((error) => {
  console.error('No se pudo migrar los datos del paciente:', error.message);
  process.exit(1);
});
