# API de Integraciones

Todos los endpoints administrativos requieren JWT de un usuario `admin`. El callback de Google y los webhooks de WhatsApp son publicos bajo sus validaciones propias.

## Google Calendar

- `GET /api/google-calendar/status`: devuelve `{ connected, calendarId?, connectedAt?, reason? }`.
- `GET /api/google-calendar/auth`: devuelve `{ authUrl }`; el frontend debe navegar a esa URL.
- `POST /api/google-calendar/disconnect`: devuelve `{ disconnected, revocation }`.
- `GET /api/google-calendar/callback`: Google lo invoca y el backend redirige a `/integraciones?google=connected|cancelled|error` sobre `FRONTEND_URL`.

`revocation` puede ser `REVOKED`, `FAILED` o `NOT_REQUIRED`. Aun con `FAILED`, las credenciales locales quedan eliminadas y el estado pasa a desconectado.

## WhatsApp Business

- `GET /api/whatsapp/status`: devuelve `{ enabled, configured, phoneNumberConfigured, webhookConfigured, apiVersion, lastVerification, lastVerificationStatus }`.
- `POST /api/whatsapp/verify-connection`: sin body; ejecuta una consulta real a Meta y devuelve el estado tecnico seguro.
- `POST /api/whatsapp/send-test`: body `{ "to": "591..." }`; devuelve `{ success, message }` o `{ success: false, code, message }`.

El envio de texto libre puede ser rechazado por Meta fuera de la ventana de conversacion de 24 horas. El frontend debe mostrar el mensaje devuelto sin asumir que la configuracion es incorrecta.

Ninguna respuesta incluye access tokens, refresh tokens, App Secret, Verify Token, Client Secret, IDs internos de mensaje ni claves de cifrado.
