BEGIN;

-- La ETAPA 3 no adopta tablas preexistentes. Si alguna existe, se compara
-- su firma para diagnosticar incompatibilidades y se detiene la migracion
-- para que su propiedad y procedencia sean revisadas manualmente.
DO $$
DECLARE
  firma_actual TEXT[];
  firma_esperada CONSTANT TEXT[] := ARRAY[
    'id:int4:NO',
    'telefono:varchar:NO',
    'nombre_whatsapp:varchar:YES',
    'paciente_id:int4:YES',
    'cita_id:int4:YES',
    'tipo_solicitud:varchar:NO',
    'estado:varchar:NO',
    'paso_actual:varchar:NO',
    'datos_temporales:jsonb:NO',
    'motivo:text:YES',
    'fecha_solicitada:date:YES',
    'hora_inicio:time:YES',
    'hora_fin:time:YES',
    'confirmacion:bool:YES',
    'intentos:int4:NO',
    'confirmada_en:timestamptz:YES',
    'cancelada_en:timestamptz:YES',
    'motivo_cancelacion:text:YES',
    'ultimo_evento_en:timestamptz:YES',
    'expira_en:timestamptz:YES',
    'created_at:timestamptz:NO',
    'updated_at:timestamptz:NO'
  ];
BEGIN
  IF to_regclass('public.whatsapp_solicitudes_cita') IS NOT NULL THEN
    SELECT array_agg(
      format('%s:%s:%s', column_name, udt_name, is_nullable)
      ORDER BY ordinal_position
    )
    INTO firma_actual
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_solicitudes_cita';

    IF firma_actual IS DISTINCT FROM firma_esperada THEN
      RAISE EXCEPTION
        'whatsapp_solicitudes_cita ya existe con una estructura incompatible. Firma actual: %',
        firma_actual;
    END IF;

    RAISE EXCEPTION
      'whatsapp_solicitudes_cita ya existe con columnas compatibles, pero no sera adoptada automaticamente. Revise su procedencia antes de continuar.';
  END IF;
END;
$$;

DO $$
DECLARE
  firma_actual TEXT[];
  firma_esperada CONSTANT TEXT[] := ARRAY[
    'id:int8:NO',
    'meta_message_id:varchar:YES',
    'solicitud_id:int4:YES',
    'cita_id:int4:YES',
    'telefono:varchar:NO',
    'direccion:varchar:NO',
    'tipo_evento:varchar:NO',
    'estado:varchar:NO',
    'error_codigo:varchar:YES',
    'error_detalle:text:YES',
    'datos:jsonb:NO',
    'procesado_en:timestamptz:YES',
    'enviado_en:timestamptz:YES',
    'entregado_en:timestamptz:YES',
    'leido_en:timestamptz:YES',
    'created_at:timestamptz:NO'
  ];
BEGIN
  IF to_regclass('public.whatsapp_eventos') IS NOT NULL THEN
    SELECT array_agg(
      format('%s:%s:%s', column_name, udt_name, is_nullable)
      ORDER BY ordinal_position
    )
    INTO firma_actual
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_eventos';

    IF firma_actual IS DISTINCT FROM firma_esperada THEN
      RAISE EXCEPTION
        'whatsapp_eventos ya existe con una estructura incompatible. Firma actual: %',
        firma_actual;
    END IF;

    RAISE EXCEPTION
      'whatsapp_eventos ya existe con columnas compatibles, pero no sera adoptada automaticamente. Revise su procedencia antes de continuar.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pacientes'
      AND column_name = 'registro_pendiente'
  ) THEN
    ALTER TABLE pacientes
      ADD COLUMN registro_pendiente BOOLEAN NOT NULL DEFAULT FALSE;
    COMMENT ON COLUMN pacientes.registro_pendiente IS
      'CREATED_BY_WHATSAPP_STAGE3_20260803';
  END IF;
END;
$$;

-- El comentario permite que DOWN distinga un indice creado por esta etapa
-- de otro indice homonimo que ya existiera previamente.
DO $$
BEGIN
  IF to_regclass('public.idx_pacientes_telefono') IS NULL THEN
    CREATE INDEX idx_pacientes_telefono ON pacientes (telefono);
    COMMENT ON INDEX idx_pacientes_telefono IS
      'CREATED_BY_WHATSAPP_STAGE3_20260803';
  END IF;
END;
$$;

CREATE TABLE whatsapp_solicitudes_cita (
  id SERIAL PRIMARY KEY,
  telefono VARCHAR(30) NOT NULL,
  nombre_whatsapp VARCHAR(150),
  paciente_id INTEGER,
  cita_id INTEGER,
  tipo_solicitud VARCHAR(50) NOT NULL,
  estado VARCHAR(40) NOT NULL DEFAULT 'INICIADA',
  paso_actual VARCHAR(80) NOT NULL DEFAULT 'INICIO',
  datos_temporales JSONB NOT NULL DEFAULT '{}'::jsonb,
  motivo TEXT,
  fecha_solicitada DATE,
  hora_inicio TIME,
  hora_fin TIME,
  confirmacion BOOLEAN,
  intentos INTEGER NOT NULL DEFAULT 0,
  confirmada_en TIMESTAMP WITH TIME ZONE,
  cancelada_en TIMESTAMP WITH TIME ZONE,
  motivo_cancelacion TEXT,
  ultimo_evento_en TIMESTAMP WITH TIME ZONE,
  expira_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT whatsapp_solicitudes_cita_paciente_fk
    FOREIGN KEY (paciente_id)
    REFERENCES pacientes(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT whatsapp_solicitudes_cita_cita_fk
    FOREIGN KEY (cita_id)
    REFERENCES citas(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT whatsapp_solicitudes_cita_tipo_check
    CHECK (tipo_solicitud IN (
      'AGENDAR',
      'REPROGRAMAR',
      'CANCELAR',
      'CONFIRMAR_ASISTENCIA',
      'SOLICITAR_ATENCION_PERSONAL'
    )),

  CONSTRAINT whatsapp_solicitudes_cita_estado_check
    CHECK (estado IN (
      'INICIADA',
      'EN_PROCESO',
      'PENDIENTE_CONFIRMACION',
      'CONFIRMADA',
      'COMPLETADA',
      'CANCELADA',
      'EXPIRADA',
      'DERIVADA_PERSONAL',
      'ERROR'
    )),

  CONSTRAINT whatsapp_solicitudes_cita_horas_check
    CHECK (hora_fin IS NULL OR (hora_inicio IS NOT NULL AND hora_fin > hora_inicio)),

  CONSTRAINT whatsapp_solicitudes_cita_intentos_check
    CHECK (intentos >= 0),

  CONSTRAINT whatsapp_solicitudes_cita_datos_temporales_check
    CHECK (jsonb_typeof(datos_temporales) = 'object')
);

COMMENT ON TABLE whatsapp_solicitudes_cita IS
  'CREATED_BY_WHATSAPP_STAGE3_20260803';

CREATE INDEX whatsapp_solicitudes_cita_telefono_estado_idx
  ON whatsapp_solicitudes_cita (telefono, estado);

CREATE INDEX whatsapp_solicitudes_cita_paciente_idx
  ON whatsapp_solicitudes_cita (paciente_id);

CREATE INDEX whatsapp_solicitudes_cita_cita_idx
  ON whatsapp_solicitudes_cita (cita_id);

CREATE INDEX whatsapp_solicitudes_cita_expiracion_idx
  ON whatsapp_solicitudes_cita (expira_en)
  WHERE estado IN ('INICIADA', 'EN_PROCESO', 'PENDIENTE_CONFIRMACION');

CREATE INDEX whatsapp_solicitudes_cita_ultimo_evento_idx
  ON whatsapp_solicitudes_cita (ultimo_evento_en DESC);

CREATE TABLE whatsapp_eventos (
  id BIGSERIAL PRIMARY KEY,
  meta_message_id VARCHAR(255),
  solicitud_id INTEGER,
  cita_id INTEGER,
  telefono VARCHAR(30) NOT NULL,
  direccion VARCHAR(10) NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'RECIBIDO',
  error_codigo VARCHAR(100),
  error_detalle TEXT,
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  procesado_en TIMESTAMP WITH TIME ZONE,
  enviado_en TIMESTAMP WITH TIME ZONE,
  entregado_en TIMESTAMP WITH TIME ZONE,
  leido_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT whatsapp_eventos_solicitud_fk
    FOREIGN KEY (solicitud_id)
    REFERENCES whatsapp_solicitudes_cita(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT whatsapp_eventos_cita_fk
    FOREIGN KEY (cita_id)
    REFERENCES citas(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,

  CONSTRAINT whatsapp_eventos_direccion_check
    CHECK (direccion IN ('ENTRANTE', 'SALIENTE', 'SISTEMA')),

  CONSTRAINT whatsapp_eventos_tipo_check
    CHECK (tipo_evento IN (
      'MENSAJE_RECIBIDO',
      'MENSAJE_PROCESADO',
      'MENSAJE_DUPLICADO',
      'CONFIRMACION_ENVIADA',
      'RECORDATORIO_ENVIADO',
      'ESTADO_ENTREGA',
      'ERROR_ENVIO',
      'CITA_CONFIRMADA',
      'CITA_CANCELADA',
      'CITA_REPROGRAMADA'
    )),

  CONSTRAINT whatsapp_eventos_estado_check
    CHECK (estado IN (
      'RECIBIDO',
      'PROCESADO',
      'DUPLICADO',
      'ENVIADO',
      'ENTREGADO',
      'LEIDO',
      'FALLIDO'
    )),

  CONSTRAINT whatsapp_eventos_datos_check
    CHECK (jsonb_typeof(datos) = 'object')
);

COMMENT ON TABLE whatsapp_eventos IS
  'CREATED_BY_WHATSAPP_STAGE3_20260803';

CREATE UNIQUE INDEX whatsapp_eventos_meta_message_id_uq
  ON whatsapp_eventos (meta_message_id)
  WHERE meta_message_id IS NOT NULL AND BTRIM(meta_message_id) <> '';

CREATE INDEX whatsapp_eventos_solicitud_idx
  ON whatsapp_eventos (solicitud_id);

CREATE INDEX whatsapp_eventos_cita_idx
  ON whatsapp_eventos (cita_id);

CREATE INDEX whatsapp_eventos_telefono_fecha_idx
  ON whatsapp_eventos (telefono, created_at DESC);

CREATE INDEX whatsapp_eventos_tipo_fecha_idx
  ON whatsapp_eventos (tipo_evento, created_at DESC);

COMMIT;
