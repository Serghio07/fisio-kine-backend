# Plan de rollback

1. Declarar incidente, congelar despliegues y guardar evidencia sanitizada.
2. Desactivar selectivamente `WHATSAPP_ENABLED`, `WHATSAPP_REMINDERS_ENABLED`, `WHATSAPP_MANUAL_REPLIES_ENABLED` y `WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED`; reiniciar y verificar. No apagar todo el backend si el resto del sistema sigue sano.
3. Volver al commit/tag aprobado y al artefacto frontend anterior; restaurar el archivo de variables desde el gestor seguro.
4. Para esquema, ejecutar DOWN en orden inverso solo si fue probado y no destruye datos requeridos. Si no, restaurar el backup previo en una base nueva y validar antes de conmutar.
5. Comparar pacientes, citas, sesiones, historias, solicitudes, derivaciones, respuestas, notificaciones, incidentes, jobs, usuarios y personal; revisar constraints e índices.
6. Realizar health/login/smoke tests y registrar causa, responsable, tiempos y decisión final.
