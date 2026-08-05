# Matriz de configuración

Nunca almacenar valores reales en Git. “Ngrok” significa configuración temporal por sesión; “producción” se completa al adquirir infraestructura.

| Variable | Componente | Desarrollo | Ngrok | Producción futura | Obligatoria | Sensible | Ejemplo | Responsable / validación |
|---|---|---|---|---|---|---|---|---|
| NODE_ENV | Backend | development | development | production | Sí | No | production | DevOps; valor permitido |
| PORT | Backend | 3000 | 3000 | puerto interno | Sí | No | 3000 | DevOps; puerto libre |
| TZ | Backend | America/La_Paz | igual | igual | Sí | No | America/La_Paz | DevOps |
| DB_SYNC | Backend | false | false | false | Sí | No | false | DevOps; readiness bloquea otro valor |
| DB_HOST/DB_PORT/DB_NAME/DB_USER | Backend | local | local | por definir | Sí | Parcial | localhost/5432 | DBA; conexión |
| DB_PASSWORD | Backend | secreto local | secreto local | gestor de secretos | Sí | Sí | vacío | DBA; presencia sin imprimir |
| JWT_SECRET/JWT_EXPIRES_IN | Backend | secreto/8h | igual | secreto fuerte/8h | Sí | Sí/No | vacío/8h | Seguridad; mínimo 32 caracteres |
| CORS_ALLOWED_ORIGINS | Backend | http://localhost:5173 | URL HTTPS temporal | dominio HTTPS | Sí | No | https://app.example.invalid | DevOps; lista CSV de orígenes válidos |
| WHATSAPP_ENABLED | Backend | false/controlado | controlado | activación progresiva | Sí | No | false | Responsable WhatsApp |
| WHATSAPP_ACCESS_TOKEN/VERIFY_TOKEN/APP_SECRET | Backend | secreto local | secreto local | gestor de secretos | Si se activa | Sí | vacío | Responsable Meta; presencia |
| WHATSAPP_PHONE_NUMBER_ID/BUSINESS_ACCOUNT_ID/API_VERSION | Backend | prueba | prueba | producción | Si se activa | Parcial | vacío/v23.0 | Responsable Meta |
| WHATSAPP_CONVERSATION_TIMEOUT_MINUTES | Backend | 30 | 30 | 30 | No | No | 30 | Backend; rango validado |
| WHATSAPP_APPOINTMENT_DURATION_MINUTES/WHATSAPP_SLOT_INTERVAL_MINUTES | Backend | 90/30 | igual | según clínica | No | No | 90/30 | Clínica; valores permitidos |
| WHATSAPP_MAX_AVAILABLE_SLOTS/WHATSAPP_SLOT_OPTIONS_TIMEOUT_MINUTES/WHATSAPP_AVAILABILITY_SEARCH_DAYS | Backend | 5/15/14 | igual | revisar | No | No | 5/15/14 | Backend; rangos validados |
| WHATSAPP_MAX_APPOINTMENTS_LIST/WHATSAPP_APPOINTMENT_LIST_TIMEOUT_MINUTES | Backend | 5/15 | igual | revisar | No | No | 5/15 | Backend |
| WHATSAPP_REMINDERS_ENABLED | Backend | false | false | activación posterior | Sí | No | false | Operaciones; smoke test |
| WHATSAPP_REMINDER_* | Backend | límites del ejemplo | controlado | plantilla aprobada | Según función | Nombre no | ver `.env.example` | WhatsApp/Backend |
| WHATSAPP_MANUAL_REPLIES_ENABLED | Backend | false | false | activación posterior | Sí | No | false | Recepción |
| WHATSAPP_MANUAL_REPLY_* | Backend | ejemplo seguro | igual | revisar | No | No | ver `.env.example` | Backend |
| INTERNAL_NOTIFICATIONS_ENABLED/POLL_SECONDS | Backend | true/60 | igual | true/60 | No | No | true/60 | Operaciones |
| WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED | Backend | false | false | activación posterior | Sí | No | false | Recepción |
| WHATSAPP_REFERRAL_PENDING_ALERT_* | Backend | límites del ejemplo | igual | revisar | No | No | ver `.env.example` | Backend |
| WHATSAPP_MONITORING_ENABLED/POLL_SECONDS | Backend | true/60 | igual | true/60 | No | No | true/60 | Admin |
| WHATSAPP_MONITORING_* | Backend | límites del ejemplo | igual | revisar | No | No | ver `.env.example` | Admin |
| VITE_API_URL | Frontend | opcional (fallback local) | URL backend ngrok + `/api` | URL HTTPS API + `/api` | Producción | No | https://api.example.invalid/api | Frontend; build falla si falta |
| VITE_ALLOWED_HOSTS | Frontend | vacío | host ngrok temporal | host final si aplica | No | No | vacío | DevOps; sin protocolo |
| VITE_API_PROXY_TARGET | Frontend | http://localhost:3000 | backend local | solo desarrollo | No | No | http://localhost:3000 | Frontend |

Las variables numéricas completas y sus valores predeterminados están en `backend/.env.example` y `src/config/whatsapp.js`.
