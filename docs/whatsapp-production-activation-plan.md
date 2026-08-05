# Activación progresiva de WhatsApp

| Paso | Requisito | Prueba / esperado | Rollback | Responsable |
|---:|---|---|---|---|
| 1 General prueba | número y secretos de prueba | health indica activo, sin jobs | `WHATSAPP_ENABLED=false` | Meta/DevOps |
| 2 Webhook | HTTPS y verify token | GET verifica, POST firmado 200 | retirar callback/desactivar | Backend |
| 3 Recepción | número autorizado | evento entrante único | desactivar general | QA |
| 4 Menú | conversación válida | opciones y estados correctos | desactivar general | QA |
| 5 Citas | paciente autorizado | listado mínimo | desactivar general | Clínica |
| 6 Derivaciones | recepción asignada | crea/reutiliza derivación | desactivar general | Recepción |
| 7 Notificaciones | destinatarios activos | aviso interno idempotente | desactivar notificaciones | Admin |
| 8 Respuestas | ventana válida | preview y envío autorizado | manual replies=false | Recepción |
| 9 Recordatorios | plantilla aprobada | un caso controlado | reminders=false | Clínica |
| 10 Alertas | umbral acordado | alerta única/repetición limitada | referral alert=false | Recepción |
| 11 Monitoreo | admin y retención | métricas/incidentes sin secretos | monitoring=false | Admin |

Cada paso requiere evidencia, aprobación del responsable y observación antes del siguiente. Esta etapa no activa ninguno.
