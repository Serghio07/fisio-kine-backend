BEGIN;
CREATE TABLE IF NOT EXISTS whatsapp_respuestas_recepcion (
  id BIGSERIAL PRIMARY KEY,
  derivacion_id BIGINT NOT NULL REFERENCES whatsapp_derivaciones_recepcion(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  telefono_normalizado VARCHAR(15) NOT NULL,
  tipo_envio VARCHAR(20) NOT NULL,
  mensaje_texto VARCHAR(1000), plantilla_nombre VARCHAR(255), plantilla_idioma VARCHAR(20),
  parametros_plantilla JSONB NOT NULL DEFAULT '[]'::jsonb,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_CONFIRMACION', intentos INTEGER NOT NULL DEFAULT 0,
  expira_en TIMESTAMPTZ NOT NULL, confirmado_en TIMESTAMPTZ, ultimo_intento_en TIMESTAMPTZ, proximo_intento_en TIMESTAMPTZ,
  aceptado_en TIMESTAMPTZ, enviado_en TIMESTAMPTZ, entregado_en TIMESTAMPTZ, leido_en TIMESTAMPTZ, fallido_en TIMESTAMPTZ,
  meta_message_id VARCHAR(255) UNIQUE, idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  error_codigo VARCHAR(100), error_categoria VARCHAR(50), error_resumen VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_respuestas_tipo_check CHECK (tipo_envio IN ('TEXTO_LIBRE','PLANTILLA')),
  CONSTRAINT whatsapp_respuestas_estado_check CHECK (estado IN ('PENDIENTE_CONFIRMACION','PROCESANDO','ACEPTADO_META','ENVIADO','ENTREGADO','LEIDO','REINTENTO','FALLIDO','CANCELADO','EXPIRADO')),
  CONSTRAINT whatsapp_respuestas_intentos_check CHECK (intentos >= 0),
  CONSTRAINT whatsapp_respuestas_telefono_check CHECK (telefono_normalizado ~ '^[1-9][0-9]{7,14}$'),
  CONSTRAINT whatsapp_respuestas_parametros_check CHECK (jsonb_typeof(parametros_plantilla) = 'array'),
  CONSTRAINT whatsapp_respuestas_contenido_check CHECK ((tipo_envio='TEXTO_LIBRE' AND mensaje_texto IS NOT NULL AND char_length(mensaje_texto) BETWEEN 1 AND 1000 AND plantilla_nombre IS NULL AND plantilla_idioma IS NULL AND parametros_plantilla='[]'::jsonb) OR (tipo_envio='PLANTILLA' AND mensaje_texto IS NULL AND plantilla_nombre IS NOT NULL AND plantilla_idioma IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS whatsapp_respuestas_derivacion_created_idx ON whatsapp_respuestas_recepcion (derivacion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_respuestas_usuario_created_idx ON whatsapp_respuestas_recepcion (usuario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_respuestas_estado_reintento_idx ON whatsapp_respuestas_recepcion (estado, proximo_intento_en) WHERE estado IN ('REINTENTO','FALLIDO');
COMMIT;
