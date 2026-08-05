const sequelize = require('../config/database');

const run = async () => {
  const [counts] = await sequelize.query(`SELECT
    (SELECT COUNT(*) FROM pacientes) AS pacientes,
    (SELECT COUNT(*) FROM citas) AS citas,
    (SELECT COUNT(*) FROM sesiones) AS sesiones,
    (SELECT COUNT(*) FROM historias_clinicas) AS historias,
    (SELECT COUNT(*) FROM whatsapp_solicitudes_cita) AS solicitudes,
    (SELECT COUNT(*) FROM whatsapp_derivaciones_recepcion) AS derivaciones,
    (SELECT COUNT(*) FROM whatsapp_respuestas_recepcion) AS respuestas,
    (SELECT COUNT(*) FROM whatsapp_incidentes_tecnicos) AS incidentes,
    (SELECT COUNT(*) FROM whatsapp_ejecuciones_jobs) AS ejecuciones_jobs`);
  const [duplicates] = await sequelize.query(`SELECT
    COUNT(*) AS incidentes
    FROM (SELECT idempotency_key FROM whatsapp_incidentes_tecnicos GROUP BY idempotency_key HAVING COUNT(*) > 1) i`);
  const [constraints] = await sequelize.query(`SELECT conrelid::regclass::text AS tabla, conname
    FROM pg_constraint
    WHERE conrelid IN ('whatsapp_incidentes_tecnicos'::regclass, 'whatsapp_ejecuciones_jobs'::regclass)
    ORDER BY tabla, conname`);
  console.log(JSON.stringify({ counts: counts[0], duplicates: duplicates[0], constraints }, null, 2));
};

run().catch((error) => {
  console.error('No se pudo verificar el monitoreo de WhatsApp:', error.message);
  process.exitCode = 1;
}).finally(() => sequelize.close());
