const sequelize = require('../config/database');
const required = ['pacientes','citas','sesiones','historias_clinicas','whatsapp_solicitudes_cita','whatsapp_derivaciones_recepcion','whatsapp_respuestas_recepcion','notificaciones_internas','whatsapp_incidentes_tecnicos','whatsapp_ejecuciones_jobs','usuarios','personal'];
const run = async () => {
  const [counts] = await sequelize.query(`SELECT ${required.map((table) => `(SELECT COUNT(*) FROM ${table}) AS ${table}`).join(',')}`);
  const [tables] = await sequelize.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name", { raw: true });
  const [constraints] = await sequelize.query("SELECT COUNT(*)::integer AS total FROM pg_constraint WHERE connamespace='public'::regnamespace");
  const [indexes] = await sequelize.query("SELECT COUNT(*)::integer AS total FROM pg_indexes WHERE schemaname='public'");
  const [sequences] = await sequelize.query("SELECT COUNT(*)::integer AS total FROM information_schema.sequences WHERE sequence_schema='public'");
  const missing = required.filter((table) => !tables.some((item) => item.name === table));
  console.log(JSON.stringify({ database: process.env.DB_NAME || 'fisio_kine_db', counts: counts[0], tables: tables.length, missing, constraints: constraints[0].total, indexes: indexes[0].total, sequences: sequences[0].total }, null, 2));
  if (missing.length) process.exitCode = 1;
};
if (require.main === module) run().catch((error) => { console.error(`VERIFY_DB_ERROR=${error.message}`); process.exitCode=1; }).finally(() => sequelize.close());
module.exports={run,required};
