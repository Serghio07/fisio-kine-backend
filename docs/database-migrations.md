# Migraciones de base de datos

Antes de migrar: detener procesos de escritura, registrar fecha/responsable, ejecutar `npm run backup:db` y verificar el archivo. Mantener `DB_SYNC=false`; está prohibido usar `sequelize.sync()`.

Orden WhatsApp (Etapas 6–18): teléfonos auditados (`audit:patient-phones` y SQL stage A/E), conversaciones, solicitud de cita, disponibilidad, confirmación final, gestión de citas, recordatorios, derivaciones, respuestas de recepción, notificaciones internas y monitoreo. Los comandos exactos están en `migration-inventory.md`.

Ejecutar una migración por vez, revisar su salida y luego los verificadores disponibles: `npm run verify:internal-notifications`, `npm run verify:whatsapp-monitoring` y `npm run verify:db`. Nunca ejecutar UP/DOWN concurrentemente.

Si falla: no repetir a ciegas; conservar logs sanitizados, identificar si la transacción revirtió, comparar esquema, corregir en una rama y reintentar solo tras backup. Para rollback, desactivar WhatsApp/jobs, usar el DOWN correspondiente en orden inverso y verificar conteos. Si el rollback no es seguro, restaurar el backup en una base nueva y conmutar únicamente tras validación. Registrar resultado y responsable.
