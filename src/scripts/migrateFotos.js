require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT');
    await sequelize.query('ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS foto TEXT');

    const queryInterface = sequelize.getQueryInterface();
    const usuarios = await queryInterface.describeTable('usuarios');
    const pacientes = await queryInterface.describeTable('pacientes');
    console.log({
      usuarios_foto: Boolean(usuarios.foto),
      pacientes_foto: Boolean(pacientes.foto)
    });
  } finally {
    await sequelize.close();
  }
};

migrate().catch((error) => {
  console.error('No se pudo aplicar la migracion de fotos:', error.message);
  process.exit(1);
});
