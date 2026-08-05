const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const migrationPath = path.resolve(__dirname, '../../docs/whatsapp-appointment-flow-up.sql');

fs.promises.readFile(migrationPath, 'utf8')
  .then((sql) => sequelize.query(sql))
  .then(() => console.info('[WhatsApp] Migración del flujo de solicitudes aplicada'))
  .catch((error) => {
    console.error(`[WhatsApp] Error de migración del flujo de solicitudes: ${error?.name || 'Error'}`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
