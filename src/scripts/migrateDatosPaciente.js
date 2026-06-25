require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS peso DECIMAL(5, 2)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS talla DECIMAL(5, 2)');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS imc DECIMAL(5, 2)');

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
