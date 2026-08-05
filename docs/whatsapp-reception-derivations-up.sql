BEGIN;
CREATE TABLE whatsapp_derivaciones_recepcion (
  id BIGSERIAL PRIMARY KEY,
  tipo_derivacion VARCHAR(40) NOT NULL, origen VARCHAR(30) NOT NULL DEFAULT 'WHATSAPP',
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE', prioridad VARCHAR(15) NOT NULL DEFAULT 'NORMAL',
  telefono_normalizado VARCHAR(15) NOT NULL,
  paciente_id INTEGER REFERENCES pacientes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  cita_id INTEGER REFERENCES citas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  solicitud_cita_id INTEGER REFERENCES whatsapp_solicitudes_cita(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  recordatorio_id BIGINT REFERENCES whatsapp_recordatorios_cita(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  conversacion_id BIGINT REFERENCES whatsapp_conversaciones(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  responsable_usuario_id INTEGER REFERENCES usuarios(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  scope_key VARCHAR(255) NOT NULL, contexto_minimo JSONB NOT NULL DEFAULT '{}'::jsonb,
  observacion_recepcion VARCHAR(500), resolucion VARCHAR(500), historial JSONB NOT NULL DEFAULT '[]'::jsonb,
  tomada_en TIMESTAMPTZ, resuelta_en TIMESTAMPTZ, cerrada_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_derivaciones_tipo_check CHECK (tipo_derivacion IN ('CONSULTA_GENERAL','REGISTRO_PACIENTE','RECORDATORIO_CITA','AYUDA_REPROGRAMACION','ERROR_DE_DATOS')),
  CONSTRAINT whatsapp_derivaciones_origen_check CHECK (origen = 'WHATSAPP'),
  CONSTRAINT whatsapp_derivaciones_estado_check CHECK (estado IN ('PENDIENTE','EN_ATENCION','RESUELTA','CERRADA','CANCELADA')),
  CONSTRAINT whatsapp_derivaciones_prioridad_check CHECK (prioridad IN ('BAJA','NORMAL','ALTA','URGENTE')),
  CONSTRAINT whatsapp_derivaciones_telefono_check CHECK (telefono_normalizado ~ '^[0-9]{5,15}$'),
  CONSTRAINT whatsapp_derivaciones_contexto_check CHECK (jsonb_typeof(contexto_minimo) = 'object'),
  CONSTRAINT whatsapp_derivaciones_historial_check CHECK (jsonb_typeof(historial) = 'array')
);
CREATE UNIQUE INDEX whatsapp_derivaciones_scope_activo_uidx ON whatsapp_derivaciones_recepcion (scope_key) WHERE estado IN ('PENDIENTE','EN_ATENCION');
CREATE INDEX whatsapp_derivaciones_estado_created_idx ON whatsapp_derivaciones_recepcion (estado, created_at);
CREATE INDEX whatsapp_derivaciones_prioridad_estado_idx ON whatsapp_derivaciones_recepcion (prioridad, estado);
CREATE INDEX whatsapp_derivaciones_responsable_estado_idx ON whatsapp_derivaciones_recepcion (responsable_usuario_id, estado);
CREATE INDEX whatsapp_derivaciones_telefono_idx ON whatsapp_derivaciones_recepcion (telefono_normalizado);
CREATE INDEX whatsapp_derivaciones_paciente_idx ON whatsapp_derivaciones_recepcion (paciente_id);
CREATE INDEX whatsapp_derivaciones_cita_idx ON whatsapp_derivaciones_recepcion (cita_id);
CREATE INDEX whatsapp_derivaciones_solicitud_idx ON whatsapp_derivaciones_recepcion (solicitud_cita_id);
CREATE INDEX whatsapp_derivaciones_recordatorio_idx ON whatsapp_derivaciones_recepcion (recordatorio_id);
CREATE INDEX whatsapp_derivaciones_conversacion_idx ON whatsapp_derivaciones_recepcion (conversacion_id);
COMMIT;
