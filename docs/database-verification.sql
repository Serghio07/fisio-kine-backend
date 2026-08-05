-- Solo lectura. Ejecutar en la base activa y en la restaurada para comparar.
SELECT
 (SELECT COUNT(*) FROM pacientes) AS pacientes,
 (SELECT COUNT(*) FROM citas) AS citas,
 (SELECT COUNT(*) FROM sesiones) AS sesiones,
 (SELECT COUNT(*) FROM historias_clinicas) AS historias,
 (SELECT COUNT(*) FROM whatsapp_solicitudes_cita) AS solicitudes,
 (SELECT COUNT(*) FROM whatsapp_derivaciones_recepcion) AS derivaciones,
 (SELECT COUNT(*) FROM whatsapp_respuestas_recepcion) AS respuestas,
 (SELECT COUNT(*) FROM notificaciones_internas) AS notificaciones,
 (SELECT COUNT(*) FROM whatsapp_incidentes_tecnicos) AS incidentes,
 (SELECT COUNT(*) FROM whatsapp_ejecuciones_jobs) AS jobs,
 (SELECT COUNT(*) FROM usuarios) AS usuarios,
 (SELECT COUNT(*) FROM personal) AS personal;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
SELECT conname,contype,conrelid::regclass FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conrelid::regclass::text,conname;
SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname;
SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' ORDER BY sequence_name;
