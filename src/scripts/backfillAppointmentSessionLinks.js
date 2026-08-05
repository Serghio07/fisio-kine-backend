const sequelize = require('../config/database');
const { backfillNoShowLinks } = require('../services/citaSesionLink.service');

backfillNoShowLinks().then((count) => console.log(`VINCULACIONES_CREADAS=${count}`)).catch((error) => {
  console.error(`BACKFILL_ERROR=${error.message}`);
  process.exitCode = 1;
}).finally(() => sequelize.close());
