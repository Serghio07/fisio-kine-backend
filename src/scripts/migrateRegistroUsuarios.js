require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE sesiones ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL');
    await sequelize.query('ALTER TABLE citas ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sesiones_usuario_id_idx ON sesiones(usuario_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS citas_usuario_id_idx ON citas(usuario_id)');

    const queryInterface = sequelize.getQueryInterface();
    const sesiones = await queryInterface.describeTable('sesiones');
    const citas = await queryInterface.describeTable('citas');
    console.log({ sesiones_usuario_id: Boolean(sesiones.usuario_id), citas_usuario_id: Boolean(citas.usuario_id) });
  } finally {
    await sequelize.close();
  }
};

migrate().catch((error) => {
  console.error('No se pudo migrar el usuario registrador:', error.message);
  process.exit(1);
});
