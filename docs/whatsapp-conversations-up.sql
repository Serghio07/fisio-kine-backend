BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
  id BIGSERIAL PRIMARY KEY,
  telefono VARCHAR(15) NOT NULL,
  paciente_id INTEGER,
  tipo_contacto VARCHAR(30) NOT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'ACTIVA',
  paso_actual VARCHAR(50) NOT NULL DEFAULT 'ESPERANDO_OPCION',
  opcion_principal VARCHAR(40),
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultimo_mensaje_en TIMESTAMP WITH TIME ZONE NOT NULL,
  expira_en TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT whatsapp_conversaciones_paciente_fk FOREIGN KEY (paciente_id)
    REFERENCES pacientes(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT whatsapp_conversaciones_tipo_check
    CHECK (tipo_contacto IN ('PACIENTE_EXISTENTE', 'CONTACTO_NUEVO')),
  CONSTRAINT whatsapp_conversaciones_estado_check
    CHECK (estado IN ('ACTIVA', 'CANCELADA', 'FINALIZADA', 'EXPIRADA')),
  CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (
    'ESPERANDO_OPCION', 'INICIO_AGENDAR_CITA', 'INICIO_CONSULTAR_CITAS',
    'INICIO_REPROGRAMAR_CANCELAR', 'INICIO_INFORMACION_CENTRO', 'DERIVACION_RECEPCION'
  )),
  CONSTRAINT whatsapp_conversaciones_opcion_check CHECK (
    opcion_principal IS NULL OR opcion_principal IN (
      'AGENDAR_CITA', 'CONSULTAR_CITAS', 'REPROGRAMAR_CANCELAR',
      'INFORMACION_CENTRO', 'HABLAR_RECEPCION'
    )
  ),
  CONSTRAINT whatsapp_conversaciones_contexto_check CHECK (jsonb_typeof(contexto) = 'object'),
  CONSTRAINT whatsapp_conversaciones_expiracion_check CHECK (expira_en > ultimo_mensaje_en)
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversaciones_telefono_activa_uq
  ON whatsapp_conversaciones (telefono) WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS whatsapp_conversaciones_expira_idx
  ON whatsapp_conversaciones (expira_en) WHERE estado = 'ACTIVA';
CREATE INDEX IF NOT EXISTS whatsapp_conversaciones_paciente_idx
  ON whatsapp_conversaciones (paciente_id);

COMMIT;
