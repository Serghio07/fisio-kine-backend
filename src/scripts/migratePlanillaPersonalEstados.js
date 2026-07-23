const sequelize = require('../config/database');
const { ensurePlanillaPersonalSchema } = require('../services/planillaPersonalSchema.service');

ensurePlanillaPersonalSchema()
  .then(() => console.log('Migración de planillas de sueldos aplicada correctamente.'))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => sequelize.close());
