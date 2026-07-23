const sequelize = require('../config/database');
const { ensurePlanillaAtencionSchema } = require('../services/planillaAtencionSchema.service');

const run = async () => {
  try {
    await ensurePlanillaAtencionSchema();
    const [columns] = await sequelize.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_name IN ('planillas_atencion_asistencia', 'planilla_sesiones')
        AND column_name IN ('historia_clinica_id', 'sesion_id', 'observacion')
      ORDER BY table_name, column_name
    `);
    console.log('Migración de relaciones de planillas aplicada.');
    console.table(columns);
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
