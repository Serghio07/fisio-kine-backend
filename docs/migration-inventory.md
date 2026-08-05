# Inventario de migraciones WhatsApp

| Etapa | Nombre | UP / DOWN | Script / comando | Aplicada local | Verificador | Reversible / dependencia |
|---|---|---|---|---|---|---|
| 6–7 | Base webhook/teléfonos | `whatsapp-stage3-up/down.sql`, `patient-phone-stage-a/e.sql` | `audit:patient-phones` y SQL controlado | Sí, tablas presentes | auditoría + `verify:db` | Sí; pacientes normalizados |
| 8 | Conversaciones | `whatsapp-conversations-up/down.sql` | `migrate:whatsapp-conversations` | Sí | tests + `verify:db` | Sí; eventos/pacientes |
| 9–10 | Solicitud de cita | `whatsapp-appointment-flow-up/down.sql` | `migrate:whatsapp-appointment-flow` | Sí | tests + `verify:db` | Sí; conversaciones |
| 11 | Disponibilidad | `whatsapp-availability-flow-up/down.sql` | `migrate:whatsapp-availability-flow` | Sí | tests | Sí; solicitudes/citas |
| 12 | Confirmación final | `whatsapp-final-confirmation-up/down.sql` | `migrate:whatsapp-final-confirmation` | Sí | tests | Sí; disponibilidad |
| 13 | Gestión de citas | `whatsapp-appointment-management-up/down.sql` | `migrate:whatsapp-appointment-management` | Sí | tests | Sí; citas/conversaciones |
| 14 | Recordatorios | `whatsapp-appointment-reminders-up/down.sql` | `migrate:whatsapp-appointment-reminders` | Sí | tests | Sí; citas/eventos |
| 15 | Derivaciones | `whatsapp-reception-derivations-up/down.sql` | `migrate:whatsapp-reception-derivations` | Sí | tests | Sí; usuarios/solicitudes |
| 16 | Respuestas recepción | `whatsapp-reception-replies-up/down.sql` | `migrate:whatsapp-reception-replies` | Sí | tests | Sí; derivaciones/eventos |
| 17 | Notificaciones | `internal-notifications-up/down.sql` | `migrate:internal-notifications` | Sí | `verify:internal-notifications` | Sí; usuarios/derivaciones |
| 18 | Monitoreo | `whatsapp-monitoring-up/down.sql` | `migrate:whatsapp-monitoring` | Sí | `verify:whatsapp-monitoring` | Sí; etapas 14–17 |

“Aplicada” se comprobó por tablas/restricciones locales el 2026-08-04; no sustituye un registro de migraciones futuro. Ejecutar rollback en orden inverso y siempre con backup previo.
