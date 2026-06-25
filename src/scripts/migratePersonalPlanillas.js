require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    const sql = fs.readFileSync(path.join(__dirname, '../../docs/personal-planillas-migration.sql'), 'utf8');
    await sequelize.query(sql);
    const queryInterface = sequelize.getQueryInterface();
    const personal = await queryInterface.describeTable('personal');
    const planillas = await queryInterface.describeTable('planillas_personal');
    const detalles = await queryInterface.describeTable('planillas_personal_detalle');
    console.log({
      personal: Boolean(personal.id),
      planillas: Boolean(planillas.id),
      detalles: Boolean(detalles.id)
    });
  } finally {
    await sequelize.close();
  }
};

migrate().catch((error) => {
  console.error('No se pudo migrar Personal y Planillas:', error.message);
  process.exit(1);
});
