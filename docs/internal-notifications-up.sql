BEGIN;
CREATE TABLE IF NOT EXISTS notificaciones_internas (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tipo VARCHAR(50) NOT NULL, titulo VARCHAR(120) NOT NULL, mensaje VARCHAR(300) NOT NULL,
  entidad_tipo VARCHAR(40) NOT NULL, entidad_id BIGINT NOT NULL,
  derivacion_id BIGINT REFERENCES whatsapp_derivaciones_recepcion(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  respuesta_recepcion_id BIGINT REFERENCES whatsapp_respuestas_recepcion(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  prioridad VARCHAR(10) NOT NULL DEFAULT 'NORMAL', estado VARCHAR(15) NOT NULL DEFAULT 'NO_LEIDA',
  leida_en TIMESTAMPTZ, idempotency_key VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notificaciones_internas_tipo_check CHECK (tipo IN ('NUEVA_DERIVACION','DERIVACION_ASIGNADA','RESPUESTA_PACIENTE','ENVIO_WHATSAPP_FALLIDO','DERIVACION_PENDIENTE_VENCIDA')),
  CONSTRAINT notificaciones_internas_prioridad_check CHECK (prioridad IN ('BAJA','NORMAL','ALTA')),
  CONSTRAINT notificaciones_internas_estado_check CHECK (estado IN ('NO_LEIDA','LEIDA')),
  CONSTRAINT notificaciones_internas_entidad_check CHECK (entidad_tipo IN ('DERIVACION_WHATSAPP','RESPUESTA_RECEPCION_WHATSAPP')),
  CONSTRAINT notificaciones_internas_lectura_check CHECK ((estado='NO_LEIDA' AND leida_en IS NULL) OR (estado='LEIDA' AND leida_en IS NOT NULL)),
  CONSTRAINT notificaciones_internas_referencia_check CHECK ((entidad_tipo='DERIVACION_WHATSAPP' AND derivacion_id IS NOT NULL AND entidad_id=derivacion_id) OR (entidad_tipo='RESPUESTA_RECEPCION_WHATSAPP' AND respuesta_recepcion_id IS NOT NULL AND derivacion_id IS NOT NULL AND entidad_id=respuesta_recepcion_id)),
  CONSTRAINT notificaciones_internas_idempotency_unique UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS notificaciones_usuario_estado_fecha_idx ON notificaciones_internas (usuario_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS notificaciones_usuario_prioridad_fecha_idx ON notificaciones_internas (usuario_id, prioridad, created_at DESC);
CREATE INDEX IF NOT EXISTS notificaciones_derivacion_idx ON notificaciones_internas (derivacion_id);
CREATE INDEX IF NOT EXISTS notificaciones_respuesta_idx ON notificaciones_internas (respuesta_recepcion_id) WHERE respuesta_recepcion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS notificaciones_usuario_no_leidas_idx ON notificaciones_internas (usuario_id, created_at DESC) WHERE estado='NO_LEIDA';
COMMIT;
