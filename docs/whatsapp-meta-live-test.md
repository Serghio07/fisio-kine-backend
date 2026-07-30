# Prueba real de WhatsApp Business Cloud API

Este procedimiento utiliza exclusivamente `physio_whatsapp_test`. No debe apuntar a `fisio_kine_db`.

## 1. Configuración privada

Completar localmente `.env.whatsapp-test` sin copiar secretos a documentación, consola o Git:

```env
DB_NAME=physio_whatsapp_test
WHATSAPP_PHONE_NUMBER=59162295637
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_SECRET=
WHATSAPP_API_VERSION=
WHATSAPP_WEBHOOK_ENABLED=true
WHATSAPP_TEST_MODE=true
WHATSAPP_TEST_NUMBERS=591XXXXXXXX
WHATSAPP_APPOINTMENTS_ENABLED=false
```

`WHATSAPP_WEBHOOK_SECRET` es el App Secret de la aplicación de Meta. `WHATSAPP_TEST_NUMBERS` contiene teléfonos de pacientes autorizados, no el número empresarial receptor.

## 2. Arranque local protegido

```powershell
npm.cmd run start:whatsapp-test
npm.cmd run start:whatsapp-gateway
```

El backend escucha en `127.0.0.1:3002`. El gateway escucha en `127.0.0.1:3100` y publica solamente:

```text
/api/whatsapp/webhook
```

Las demás rutas responden `404` desde el gateway.

## 3. Túnel HTTPS

Instalar una herramienta de túnel aprobada y dirigirla únicamente al puerto `3100`. Ejemplo conceptual:

```powershell
cloudflared tunnel --url http://127.0.0.1:3100
```

La Callback URL resultante será:

```text
https://DOMINIO-TEMPORAL/api/whatsapp/webhook
```

Los túneles temporales cambian de URL al reiniciarse. Para un entorno estable debe utilizarse un subdominio de staging.

## 4. Configuración en Meta

En la aplicación de Meta:

1. Abrir WhatsApp > Configuration.
2. Registrar la Callback URL.
3. Introducir el mismo valor privado de `WHATSAPP_VERIFY_TOKEN`.
4. Verificar el endpoint.
5. Suscribir únicamente el campo `messages`.
6. Confirmar que el número remitente esté en `WHATSAPP_TEST_NUMBERS`.

## 5. Mensaje autorizado

Enviar desde un número permitido:

```text
Hola, quiero agendar una cita en Physio Active. REF:WEB-PHYSIO
```

Respuesta esperada:

```text
Hola 👋 Bienvenido a Physio Active.

Te ayudaremos a reservar tu cita.

¿Para quién deseas realizar la reserva?

1. Para mí
2. Para otra persona
```

## 6. Evidencia segura

Comprobar en `physio_whatsapp_test`:

- conversación `ACTIVA`;
- `ultimo_paso=BIENVENIDA`;
- origen `WEB`;
- referencia `WEB-PHYSIO`;
- mensaje entrante sin la referencia en el texto resumido;
- mensaje saliente y estados;
- auditoría del procesamiento;
- cero cambios en pacientes y citas.

Los logs solamente deben contener teléfonos enmascarados, identificadores parciales y resultados resumidos.
