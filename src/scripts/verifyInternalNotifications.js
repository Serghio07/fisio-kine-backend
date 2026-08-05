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
    (SELECT COUNT(*) FROM notificaciones_internas) AS notificaciones`);
  const [duplicates] = await sequelize.query(`SELECT COUNT(*) AS total FROM (
    SELECT idempotency_key FROM notificaciones_internas GROUP BY idempotency_key HAVING COUNT(*) > 1
  ) AS duplicados`);
  const [constraints] = await sequelize.query("SELECT conname FROM pg_constraint WHERE conrelid = 'notificaciones_internas'::regclass ORDER BY conname");
  console.log(JSON.stringify({ counts: counts[0], duplicates: duplicates[0].total, constraints: constraints.map((item) => item.conname) }, null, 2));
};
run().catch((error) => { console.error('No se pudo verificar notificaciones:', error.message); process.exitCode = 1; }).finally(() => sequelize.close());
