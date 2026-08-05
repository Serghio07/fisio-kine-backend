# Desactivación de emergencia de WhatsApp

1. Establecer `WHATSAPP_ENABLED=false`, `WHATSAPP_REMINDERS_ENABLED=false`, `WHATSAPP_MANUAL_REPLIES_ENABLED=false` y `WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED=false` en el entorno seguro.
2. Reiniciar únicamente el backend mediante el gestor de procesos futuro.
3. Consultar `/api/health`: WhatsApp y jobs deben figurar desactivados. Revisar panel y confirmar que no aparecen nuevas ejecuciones.
4. Si solo falla una automatización, apagar su flag específico antes que todo WhatsApp.

Esto detiene nuevos procesamientos/envíos automáticos; no elimina ni modifica pacientes, citas, sesiones, historias, pagos, conversaciones, derivaciones o auditorías. No borrar secretos ni registros durante el incidente; rotarlos posteriormente si hubo exposición confirmada.
