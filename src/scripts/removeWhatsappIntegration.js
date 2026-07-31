const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

if (!process.argv.includes('--confirm')) {
  console.error('Eliminacion cancelada: debes indicar --confirm.');
  process.exit(1);
}

const sequelize = require('../config/database');

const remove = async () => {
  try {
    await sequelize.authenticate();
    const sql = fs.readFileSync(
      path.join(__dirname, '../../docs/remove-whatsapp-integration.sql'),
      'utf8'
    );
    await sequelize.query(sql);
    console.log('Integracion de WhatsApp eliminada de la base de datos.');
  } finally {
    await sequelize.close();
  }
};

remove().catch((error) => {
  console.error('No se pudo eliminar la integracion de WhatsApp:', error.message);
  process.exit(1);
});
