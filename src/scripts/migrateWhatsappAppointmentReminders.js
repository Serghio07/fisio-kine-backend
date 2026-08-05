const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const run = async () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../docs/whatsapp-appointment-reminders-up.sql'), 'utf8');
  await sequelize.query(sql);
  console.log('Migración de recordatorios de citas por WhatsApp aplicada.');
};

run().catch((error) => {
  console.error('No se pudo aplicar la migración de recordatorios de citas por WhatsApp:', error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
