# WhatsApp Business y agendamiento — Estado de implementación

**Proyecto:** Physio Active  
**Fecha de actualización:** 29 de julio de 2026  
**Estado general:** preparación técnica local y simulador administrativo completados; conexión real con Meta y creación de citas todavía pendientes.

---

## 1. Objetivo del desarrollo

El objetivo es permitir que los pacientes puedan iniciar y gestionar una solicitud de cita mediante WhatsApp, manteniendo la agenda, los pacientes y la información clínica protegidos.

El desarrollo se dividió en etapas para evitar cambios riesgosos en producción:

1. Preparación de botones, modelos y campos de origen.
2. Respaldo y migración en una base aislada.
3. Webhook y persistencia local de mensajes.
4. Simulador administrativo y motor central de conversación.
5. Conexión real con Meta.
6. Consulta de disponibilidad, reserva temporal y creación de la cita.
7. Cancelación, reprogramación y recordatorios.

Actualmente están completadas las etapas 1 a 4.

---

## 2. Resumen ejecutivo de lo realizado

### 2.1 Acceso público por WhatsApp

Se prepararon los botones públicos con el texto **“Agendar por WhatsApp”**.

Datos configurados:

- Número de Physio Active: `+591 62295637`.
- Número normalizado: `59162295637`.
- Mensaje inicial: “Hola, quiero agendar una cita en Physio Active. REF:WEB-PHYSIO”.
- Referencia de origen: `REF:WEB-PHYSIO`.

Esta referencia permite diferenciar una conversación iniciada desde la página web de una conversación iniciada directamente desde WhatsApp.

### 2.2 Preparación del módulo Citas y Agenda

Se preparó el módulo para reconocer futuras citas provenientes de WhatsApp:

- Canal de origen.
- Referencia de origen.
- Estado de confirmación.
- Profesional asociado.
- Paciente verificado.
- Identificador de conversación.
- Identificador de mensaje.
- Reserva temporal.
- Fechas de notificación y cancelación.
- Motivo de reprogramación.
- Filtros e insignias visuales en la agenda administrativa.

La lógica existente de las citas manuales se mantiene.

### 2.3 Respaldo y base aislada

Se generó y verificó el respaldo previo a la integración:

- Archivo: `physio_backup_antes_whatsapp_20260729_1145.backup`.
- Tamaño: `319207 bytes`.
- SHA-256: `1E5F5684E9D747E78FDC09A28C8452F846D1F68B30A494BE155D372BA8D7AAE9`.

Se utiliza una base separada:

```text
physio_whatsapp_test
```

La migración fue probada dos veces para comprobar que es idempotente. Se crearon:

- 7 tablas auxiliares.
- 11 índices.
- 8 restricciones.

Tablas auxiliares:

- `conversaciones_whatsapp`
- `mensajes_whatsapp`
- `reservas_temporales`
- `recordatorios_citas`
- `auditoria_whatsapp`
- `bloqueos_agenda`
- `configuracion_tipos_atencion`

### 2.4 Webhook técnico local

Se implementaron las rutas:

```text
GET  /api/whatsapp/webhook
POST /api/whatsapp/webhook
```

El webhook puede:

- Procesar la verificación GET.
- Comparar de forma segura el token de verificación.
- Validar la firma `X-Hub-Signature-256`.
- Recibir mensajes normalizados.
- Detectar `REF:WEB-PHYSIO`.
- Diferenciar origen web y WhatsApp directo.
- Crear o reutilizar conversaciones.
- Persistir mensajes entrantes y salientes.
- Ignorar mensajes duplicados.
- Procesar estados `sent`, `delivered`, `read` y `failed`.
- Responder rápidamente antes del procesamiento.
- Continuar funcionando cuando la integración está desactivada.

La estructura está preparada para Meta, pero todavía no se ha realizado una prueba real con WhatsApp Cloud API.

### 2.5 Motor central de conversación

Se creó un motor único en:

```text
backend/src/services/whatsappConversation.service.js
```

Este motor puede ser utilizado por:

- El simulador administrativo.
- El webhook real de Meta en una etapa posterior.

Esto evita mantener dos flujos diferentes.

Funciones implementadas:

- Normalización del teléfono.
- Inicio o reutilización de una conversación activa.
- Registro de mensajes entrantes y salientes.
- Transiciones controladas entre pasos.
- Auditoría de acciones.
- Prevención de mensajes duplicados.
- Reinicio sin borrar el historial.
- Búsqueda de pacientes por teléfono.
- Manejo de cero, una o varias coincidencias.
- Protección del nombre del paciente.
- Verificación mediante los últimos cuatro dígitos del CI.
- Bloqueo después de tres intentos incorrectos.
- Captura progresiva de datos cuando la reserva es para otra persona.

### 2.6 Simulador administrativo

Se agregó la pantalla:

```text
/configuracion/whatsapp/simulador
```

La pantalla está disponible únicamente para administradores y contiene:

#### Configuración de prueba

- Número del paciente.
- Origen `WHATSAPP` o `WEB_WHATSAPP`.
- Botón para iniciar la conversación.
- Botón para reiniciar.
- Indicador de base de datos.
- Indicador de modo prueba.
- Advertencia de que no se envían mensajes reales.

#### Conversación

- Mensajes del paciente a la derecha.
- Mensajes de Physio Active a la izquierda.
- Hora y estado del mensaje.
- Campo para escribir.
- Opciones rápidas.
- Botón **“Reenviar como duplicado”**.

#### Información técnica

- ID de conversación.
- Teléfono enmascarado.
- Origen.
- Estado.
- Paso actual.
- Paciente asociado.
- Paciente verificado.
- Número de intentos.
- Reserva temporal.
- Cita creada.
- Datos temporales protegidos.
- Auditoría reciente.

La interfaz fue validada en computadora y móvil sin desbordamiento horizontal.

---

## 3. Flujo conversacional disponible

### 3.1 Inicio

El sistema muestra:

> Hola 👋 Bienvenido a Physio Active.  
> Te ayudaremos a reservar tu cita.  
> ¿Para quién deseas realizar la reserva?

Opciones internas:

- `BOOK_FOR_ME` — Para mí.
- `BOOK_FOR_OTHER` — Para otra persona.

### 3.2 Reserva “Para mí”

El sistema:

1. Busca pacientes por el teléfono normalizado.
2. No crea pacientes.
3. Maneja cero, una o varias coincidencias.
4. Muestra solamente el primer nombre y la inicial del apellido.
5. Solicita los últimos cuatro dígitos del CI.
6. Permite un máximo de tres intentos.
7. Deja la conversación lista para continuar hacia el tipo de atención.

No muestra diagnósticos, historia clínica, CI completo, domicilio, pagos ni deudas.

### 3.3 Reserva “Para otra persona”

El sistema solicita progresivamente:

1. Nombre.
2. Apellidos.
3. CI.
4. Fecha de nacimiento.
5. Relación con la persona que realiza la reserva.

Los datos se almacenan temporalmente en la conversación. No se crea todavía un paciente.

### 3.4 Estados de conversación

- `ACTIVA`
- `FINALIZADA`
- `EXPIRADA`
- `BLOQUEADA`
- `CANCELADA`

### 3.5 Pasos implementados

- `BIENVENIDA`
- `SELECCION_PERSONA`
- `BUSQUEDA_PACIENTE`
- `SELECCION_PACIENTE`
- `VERIFICACION_IDENTIDAD`
- `PACIENTE_NO_ENCONTRADO`
- `OTRA_PERSONA_NOMBRE`
- `OTRA_PERSONA_APELLIDOS`
- `OTRA_PERSONA_CI`
- `OTRA_PERSONA_FECHA_NACIMIENTO`
- `OTRA_PERSONA_RELACION`
- `LISTO_PARA_TIPO_ATENCION`

No se permite saltar arbitrariamente entre pasos.

---

## 4. Endpoints del simulador

Todos requieren autenticación y rol administrador:

```text
POST /api/whatsapp/simulator/start
POST /api/whatsapp/simulator/message
POST /api/whatsapp/simulator/reset
GET  /api/whatsapp/simulator/conversations/:id
GET  /api/whatsapp/simulator/conversations/:id/messages
GET  /api/whatsapp/simulator/conversations/:id/audit
```

El envío del simulador no llama a WhatsApp Cloud API.

---

## 5. Configuración y medidas de seguridad

Configuración utilizada por el simulador:

```text
DB_NAME=physio_whatsapp_test
WHATSAPP_PROVIDER=SIMULATOR
WHATSAPP_TEST_MODE=true
WHATSAPP_APPOINTMENTS_ENABLED=false
WHATSAPP_WEBHOOK_ENABLED=false
```

Protecciones implementadas:

- El simulador se bloquea si intenta utilizar `fisio_kine_db`.
- Las credenciales permanecen exclusivamente en el backend.
- Los archivos `.env` reales no se versionan.
- Los tokens y secretos no aparecen en la interfaz.
- Los teléfonos se presentan enmascarados.
- El CI no aparece en mensajes técnicos.
- Las entradas tienen validación y límite de tamaño.
- Las consultas utilizan parámetros y Sequelize.
- Los mensajes tienen identificadores únicos.
- Las transiciones generan auditoría.
- Los duplicados no repiten acciones ni respuestas.
- Reiniciar finaliza la conversación anterior sin eliminar registros.
- La creación automática de citas permanece desactivada.

Variables preparadas, pero todavía sin valores reales de Meta:

```text
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_BUSINESS_ACCOUNT_ID
WHATSAPP_ACCESS_TOKEN
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_WEBHOOK_SECRET
WHATSAPP_API_VERSION
WHATSAPP_TEST_NUMBERS
```

---

## 6. Pruebas realizadas

### 6.1 Pruebas automatizadas del webhook

Resultado:

```text
16 pruebas aprobadas de 16
```

Incluyen:

- Backend activo con WhatsApp desactivado.
- Error controlado del servicio de envío.
- Registro de conversación y bienvenida.
- Actualización de estados.
- Detección de origen.
- Firma HMAC.
- Verificación GET.
- Recepción POST.
- Lista blanca.
- Idempotencia.
- Protección contra uso de la base activa.
- Ausencia de creación de pacientes y citas.

### 6.2 Pruebas del simulador

Se aprobaron:

- Inicio con origen WhatsApp.
- Inicio con origen web.
- Selección “Para mí”.
- Selección “Para otra persona”.
- Paciente encontrado.
- Paciente no encontrado.
- Varios pacientes con el mismo teléfono.
- Nombre protegido.
- CI protegido.
- Captura progresiva.
- Transición inválida.
- Duplicado ignorado.
- Reinicio con historial.
- Auditoría.
- Autenticación.
- Restricción por rol administrador.
- Los seis endpoints administrativos.

### 6.3 Integridad de datos

Antes y después de las pruebas:

| Módulo | Antes | Después |
|---|---:|---:|
| Pacientes | 4 | 4 |
| Citas | 6 | 6 |
| Historias clínicas | 7 | 7 |
| Sesiones | 23 | 23 |
| Pagos | 0 | 0 |

La base `fisio_kine_db` no contiene las tablas auxiliares de WhatsApp y permanece intacta.

### 6.4 Validación visual

Evidencias:

- `frontend/artifacts/whatsapp-simulator-desktop.png`
- `frontend/artifacts/whatsapp-simulator-mobile.png`

Comprobaciones:

- Diseño responsive.
- Sin desbordamiento horizontal.
- Chat visible.
- Panel técnico visible.
- Base de prueba identificada.
- Advertencia de entorno aislado.
- Sin tokens ni secretos visibles.

---

## 7. Archivos principales

### Backend

- `docs/whatsapp-appointments-migration.sql`
- `docs/whatsapp-stage-2-runbook.md`
- `docs/whatsapp-meta-live-test.md`
- `src/config/whatsapp.js`
- `src/controllers/whatsapp.controller.js`
- `src/controllers/whatsappSimulator.controller.js`
- `src/middlewares/whatsappSignature.middleware.js`
- `src/middlewares/whatsappSimulator.middleware.js`
- `src/models/ConversacionWhatsapp.js`
- `src/models/MensajeWhatsapp.js`
- `src/models/AuditoriaWhatsapp.js`
- `src/routes/whatsapp.routes.js`
- `src/services/whatsapp.service.js`
- `src/services/whatsappAudit.service.js`
- `src/services/whatsappWebhook.service.js`
- `src/services/whatsappConversation.service.js`
- `src/scripts/migrateWhatsappAppointments.js`
- `src/scripts/verifyWhatsappPersistence.js`
- `src/scripts/verifyWhatsappSimulator.js`
- `tests/whatsapp/`

### Frontend administrativo

- `src/pages/configuracion/WhatsappSimulator.jsx`
- `src/services/whatsappSimulatorService.js`
- `src/routes/AppRoutes.jsx`
- `src/components/layout/Sidebar.jsx`
- `scripts/verifyWhatsappSimulatorVisual.mjs`

---

## 8. Funcionalidades todavía pendientes

### 8.1 Conexión real con Meta

Todavía falta:

- Crear o configurar la aplicación en Meta for Developers.
- Vincular el número de WhatsApp Business.
- Obtener `Phone Number ID`.
- Obtener `WhatsApp Business Account ID`.
- Crear un token de acceso seguro.
- Crear un token de verificación.
- Configurar el App Secret.
- Publicar el webhook mediante HTTPS.
- Registrar la Callback URL en Meta.
- Suscribirse al campo `messages`.
- Realizar una prueba con un número autorizado.
- Confirmar recepción de un mensaje real.
- Enviar una respuesta real.
- Confirmar estados `sent`, `delivered`, `read` y `failed`.

Esta conexión debe realizarse primero con:

```text
DB_NAME=physio_whatsapp_test
WHATSAPP_TEST_MODE=true
WHATSAPP_APPOINTMENTS_ENABLED=false
WHATSAPP_PROVIDER=META
```

### 8.2 Registro o preinscripción de paciente

Falta implementar:

- Verificación completa de identidad.
- Flujo cuando el paciente no existe.
- Confirmación de datos capturados.
- Consentimiento para el tratamiento de datos.
- Registro como paciente preinscrito.
- Prevención de pacientes duplicados.
- Revisión administrativa antes de convertirlo en paciente definitivo.

### 8.3 Tipo de atención

El flujo llega hasta `LISTO_PARA_TIPO_ATENCION`, pero falta:

- Consultar los tipos de atención habilitados.
- Mostrar nombre, descripción y duración.
- Permitir seleccionar el servicio.
- Validar que el servicio siga activo.

### 8.4 Profesional y disponibilidad

Falta:

- Seleccionar profesional o “cualquier profesional disponible”.
- Consultar horarios reales.
- Considerar duración del servicio.
- Considerar citas, bloqueos y reservas temporales.
- Evitar solapamientos.
- Aplicar zona horaria de Bolivia.
- Mostrar únicamente horarios válidos.

### 8.5 Reserva temporal

La tabla está preparada, pero la funcionalidad no está activa. Falta:

- Crear una reserva temporal.
- Definir su tiempo de expiración.
- Bloquear temporalmente el horario.
- Liberar reservas expiradas.
- Evitar que dos conversaciones confirmen el mismo horario.
- Mostrar un resumen antes de confirmar.

### 8.6 Creación de la cita

Falta:

- Solicitar confirmación final.
- Crear la cita usando el servicio existente.
- Asociar paciente, profesional, conversación y reserva.
- Marcar `canal_origen=WHATSAPP`.
- Evitar creación doble por mensajes repetidos.
- Notificar al paciente.
- Mostrar la cita en Citas y Agenda.

`WHATSAPP_APPOINTMENTS_ENABLED` debe mantenerse en `false` hasta finalizar estas pruebas.

### 8.7 Operaciones posteriores

No están implementadas:

- Consultar una cita existente.
- Cancelar.
- Reprogramar.
- Recordatorios automáticos.
- Confirmación previa a la atención.
- Manejo de inasistencias.
- Transferencia de la conversación a una persona.

### 8.8 Operación y monitoreo

Falta definir:

- Política de expiración de conversaciones.
- Limpieza controlada de datos temporales.
- Rotación de tokens.
- Monitoreo de errores del webhook.
- Alertas por fallos de Meta.
- Métricas de conversaciones y conversiones.
- Política de retención de mensajes y auditorías.
- Procedimiento de atención manual ante fallos.

---

## 9. Orden recomendado para continuar

1. Mantener la base de producción sin cambios.
2. Conectar Meta únicamente al entorno `physio_whatsapp_test`.
3. Verificar un mensaje real entrante y una respuesta básica.
4. Verificar lista blanca, firma e idempotencia.
5. Confirmar estados de entrega.
6. Conectar el webhook real al motor conversacional existente.
7. Completar la verificación de identidad.
8. Implementar paciente preinscrito.
9. Implementar tipo de atención.
10. Implementar consulta de disponibilidad.
11. Implementar reserva temporal.
12. Implementar confirmación y creación de cita.
13. Probar concurrencia y mensajes duplicados.
14. Implementar cancelación y reprogramación.
15. Implementar recordatorios.
16. Realizar una prueba piloto antes de habilitar producción.

---

## 10. Acciones manuales que deberá realizar el administrador

Para la conexión real será necesario:

1. Acceder a Meta for Developers.
2. Crear o seleccionar la aplicación empresarial.
3. Agregar el producto WhatsApp.
4. Asociar la cuenta de WhatsApp Business.
5. Obtener los identificadores requeridos.
6. Autorizar números de prueba.
7. Configurar el webhook HTTPS.
8. Introducir los secretos solamente en el backend.
9. Confirmar la suscripción a mensajes.
10. Participar en la prueba controlada con un teléfono autorizado.

Los valores secretos no deben enviarse por chat, incluirse en capturas ni guardarse en Git.

---

## 11. Conclusión

Physio Active ya cuenta con la base técnica local para continuar el agendamiento por WhatsApp de forma controlada:

- Persistencia y auditoría.
- Webhook preparado.
- Motor conversacional reutilizable.
- Identificación inicial.
- Protección de datos.
- Simulador administrativo responsive.
- Pruebas automatizadas.
- Base aislada.

El sistema todavía **no envía mensajes reales por Meta** y **no crea pacientes, reservas ni citas automáticamente**. La próxima etapa debe centrarse primero en la conexión real controlada con Meta y posteriormente en la preinscripción, disponibilidad y confirmación de la cita.
