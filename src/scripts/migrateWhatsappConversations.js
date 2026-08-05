const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const migrationPath = path.resolve(__dirname, '../../docs/whatsapp-conversations-up.sql');

fs.promises.readFile(migrationPath, 'utf8')
  .then((sql) => sequelize.query(sql))
  .then(() => console.info('[WhatsApp] Migración de conversaciones aplicada'))
  .catch((error) => {
    console.error(`[WhatsApp] Error de migración de conversaciones: ${error?.name || 'Error'}`);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
