# Matriz E2E WhatsApp

Usar fixtures, mocks o un número expresamente autorizado; nunca datos clínicos reales. Estado inicial: automatizada/local cuando existe prueba; casos externos pendientes de ngrok/autorización.

| ID | Módulo | Precondición / datos | Pasos | Esperado | Obtenido / estado | Evidencia / observaciones |
|---|---|---|---|---|---|---|
| E2E-01 | Webhook GET | integración controlada | enviar challenge/token | challenge o rechazo seguro | Cubierto / PASS local | tests webhook |
| E2E-02 | Webhook POST | fixture firmado | POST | 200 y proceso único | Cubierto / PASS | tests webhook |
| E2E-03 | Firma | firma inválida | POST | rechazo, incidente sin secreto | Cubierto / PASS | signature/monitoring tests |
| E2E-04 | Duplicado | mismo message id | repetir | no duplica/responde | Cubierto / PASS | webhook tests |
| E2E-05 | Paciente | fixture existente | mensaje | menú personalizado seguro | Cubierto / PASS | conversation tests |
| E2E-06 | Contacto nuevo | teléfono fixture | mensaje | no crea paciente | Cubierto / PASS | conversation tests |
| E2E-07 | MENÚ | conversación activa | escribir MENÚ | menú, mismo control | Cubierto / PASS | conversation tests |
| E2E-08 | Agendar | fixture solicitud | completar flujo | solicitud/cita según confirmación | Cubierto / PASS | appointment tests |
| E2E-09 | Consultar | paciente fixture | opción 2 | citas futuras mínimas | Cubierto / PASS | management tests |
| E2E-10 | Cancelar | confirmación fixture | confirmar | solo cita seleccionada | Cubierto / PASS | management tests |
| E2E-11 | Reprogramar | capacidad fixture | elegir/confirmar | misma cita, horario válido | Cubierto / PASS | management tests |
| E2E-12 | Recepción | conversación fixture | opción recepción | derivación idempotente | Cubierto / PASS | referral tests |
| E2E-13 | Tomar/observar | usuario fixture | acciones API | locks/auditoría | Cubierto / PASS | referral tests |
| E2E-14 | Respuesta en ventana | evento entrante fixture | preview/confirmar | envío mock aceptado | Cubierto / PASS | reply tests |
| E2E-15 | Fuera de ventana | evento vencido | intentar | bloqueo seguro | Cubierto / PASS | reply tests |
| E2E-16 | Notificación | derivación fixture | disparar | propia e idempotente | Cubierto / PASS | notification tests |
| E2E-17 | Incidente/panel | error sanitizado | listar/revisar | sin secretos | Cubierto / PASS | monitoring tests |
| E2E-18 | Reintento | REINTENTO fixture | acción admin | revalida y limita | Cubierto / PASS | recovery tests |
| E2E-19 | Callback desconocido | fixture | POST | incidente controlado | Cubierto / PASS | webhook tests |
| E2E-20 | Reminder apagado | flag false | iniciar job | no envío | Cubierto / PASS | reminder tests |
| E2E-21 | Logs | suite completa | buscar PII/secreto | no valores sensibles | Revisión estática / PASS con observaciones | informe readiness |
| E2E-22 | Ngrok real | autorización + URL temporal | repetir 01–02 | Meta alcanza backend | PENDIENTE | no hay ngrok instalado |
| E2E-23 | UI integral | servicios locales | login/navegar | vistas operativas | PENDIENTE manual | requiere sesión autorizada |
| E2E-24 | No duplicación | fixtures repetidos | reintentar | claves/locks evitan duplicados | Cubierto / PASS | 147 tests backend |
