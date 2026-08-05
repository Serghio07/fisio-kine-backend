const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const run = async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../docs/whatsapp-final-confirmation-up.sql'), 'utf8');
  await sequelize.query(sql);
  console.log('Migración de confirmación final WhatsApp aplicada.');
};

run().catch((error) => { console.error('No se pudo aplicar la migración de confirmación final WhatsApp:', error.message); process.exitCode = 1; }).finally(() => sequelize.close());
