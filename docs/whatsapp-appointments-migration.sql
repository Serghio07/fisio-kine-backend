BEGIN;

-- Preparación aditiva de la agenda existente. No modifica citas históricas.
ALTER TABLE citas ADD COLUMN IF NOT EXISTS canal_origen VARCHAR(30);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS referencia_origen VARCHAR(100);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS estado_confirmacion VARCHAR(30);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS fecha_confirmacion TIMESTAMPTZ;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS whatsapp_message_id VARCHAR(255);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS whatsapp_conversation_id INTEGER;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS reserva_temporal_id INTEGER;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS paciente_verificado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS metodo_verificacion VARCHAR(50);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS fecha_ultima_notificacion TIMESTAMPTZ;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS motivo_reprogramacion TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS canal_cancelacion VARCHAR(30);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS fecha_cancelacion TIMESTAMPTZ;

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estado_registro VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS origen_registro VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS origen_registro_detalle VARCHAR(50);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS datos_clinicos_estado VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ci_numero VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ci_complemento VARCHAR(15);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS ci_expedido VARCHAR(20);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono_normalizado VARCHAR(30);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS email VARCHAR(180);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS consentimiento_datos_en TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS conversaciones_whatsapp (
  id SERIAL PRIMARY KEY,
  telefono VARCHAR(30) NOT NULL,
  paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  origen_conversacion VARCHAR(20) NOT NULL DEFAULT 'WHATSAPP',
  referencia_origen VARCHAR(100),
  estado_flujo VARCHAR(60) NOT NULL DEFAULT 'INICIADA',
  ultimo_paso VARCHAR(100) NOT NULL DEFAULT 'BIENVENIDA',
  datos_temporales JSONB NOT NULL DEFAULT '{}'::jsonb,
  intentos_verificacion INTEGER NOT NULL DEFAULT 0,
  fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_ultima_interaccion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
  id SERIAL PRIMARY KEY,
  conversacion_id INTEGER NOT NULL REFERENCES conversaciones_whatsapp(id) ON DELETE RESTRICT,
  paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL,
  message_id_externo VARCHAR(255),
  direccion VARCHAR(15) NOT NULL,
  tipo VARCHAR(40) NOT NULL,
  contenido_resumido VARCHAR(500),
  estado_envio VARCHAR(30),
  fecha_recepcion TIMESTAMPTZ,
  fecha_envio TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ,
  fecha_lectura TIMESTAMPTZ,
  fecha_error TIMESTAMPTZ,
  codigo_error VARCHAR(80),
  error_resumido VARCHAR(500),
  respuesta_api_resumida JSONB NOT NULL DEFAULT '{}'::jsonb,
  reintentos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservas_temporales (
  id SERIAL PRIMARY KEY,
  paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  telefono VARCHAR(30) NOT NULL,
  profesional_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  tipo_atencion VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  fecha_expiracion TIMESTAMPTZ NOT NULL,
  canal VARCHAR(30) NOT NULL,
  referencia_origen VARCHAR(100),
  estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
  token VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reserva_horas CHECK (hora_fin > hora_inicio)
);

CREATE TABLE IF NOT EXISTS recordatorios_citas (
  id SERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES citas(id) ON DELETE RESTRICT,
  tipo VARCHAR(40) NOT NULL,
  fecha_programada TIMESTAMPTZ NOT NULL,
  fecha_envio TIMESTAMPTZ,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE',
  identificador_mensaje VARCHAR(255),
  respuesta VARCHAR(80),
  fecha_respuesta TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditoria_whatsapp (
  id SERIAL PRIMARY KEY,
  conversacion_id INTEGER REFERENCES conversaciones_whatsapp(id) ON DELETE SET NULL,
  paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
  cita_id INTEGER REFERENCES citas(id) ON DELETE SET NULL,
  accion VARCHAR(80) NOT NULL,
  canal VARCHAR(30),
  estado_anterior VARCHAR(60),
  estado_nuevo VARCHAR(60),
  proceso VARCHAR(80) NOT NULL,
  message_id_externo VARCHAR(255),
  resultado VARCHAR(30) NOT NULL,
  error_resumido VARCHAR(500),
  datos JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bloqueos_agenda (
  id SERIAL PRIMARY KEY,
  profesional_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  hora_inicio TIME,
  hora_fin TIME,
  motivo VARCHAR(255),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configuracion_tipos_atencion (
  id SERIAL PRIMARY KEY,
  tipo_atencion VARCHAR(100) NOT NULL UNIQUE,
  duracion_minutos INTEGER NOT NULL DEFAULT 30,
  separacion_minutos INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_duracion_atencion CHECK (duracion_minutos > 0),
  CONSTRAINT chk_separacion_atencion CHECK (separacion_minutos >= 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citas_whatsapp_conversation_id_fkey'
      AND conrelid = 'citas'::regclass
  ) THEN
    ALTER TABLE citas ADD CONSTRAINT citas_whatsapp_conversation_id_fkey
      FOREIGN KEY (whatsapp_conversation_id) REFERENCES conversaciones_whatsapp(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'citas_reserva_temporal_id_fkey'
      AND conrelid = 'citas'::regclass
  ) THEN
    ALTER TABLE citas ADD CONSTRAINT citas_reserva_temporal_id_fkey
      FOREIGN KEY (reserva_temporal_id) REFERENCES reservas_temporales(id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO configuracion_tipos_atencion (tipo_atencion, duracion_minutos)
VALUES
  ('Primera consulta', 45),
  ('Sesion de fisioterapia', 30),
  ('Sesion de tratamiento', 30),
  ('Evaluacion', 45),
  ('Control', 30),
  ('Rehabilitacion', 45),
  ('Otro', 30)
ON CONFLICT (tipo_atencion) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_citas_canal_origen'
      AND conrelid = 'citas'::regclass
  ) THEN
    ALTER TABLE citas ADD CONSTRAINT chk_citas_canal_origen
      CHECK (canal_origen IS NULL OR canal_origen IN ('SISTEMA_INTERNO', 'WHATSAPP', 'WEB_WHATSAPP', 'OTRO'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_citas_estado_confirmacion'
      AND conrelid = 'citas'::regclass
  ) THEN
    ALTER TABLE citas ADD CONSTRAINT chk_citas_estado_confirmacion
      CHECK (estado_confirmacion IS NULL OR estado_confirmacion IN ('PENDIENTE', 'CONFIRMADA', 'SIN_RESPUESTA', 'RECHAZADA'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_conversacion_origen'
      AND conrelid = 'conversaciones_whatsapp'::regclass
  ) THEN
    ALTER TABLE conversaciones_whatsapp ADD CONSTRAINT chk_conversacion_origen
      CHECK (origen_conversacion IN ('WEB', 'WHATSAPP'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_conversacion_estado'
      AND conrelid = 'conversaciones_whatsapp'::regclass
  ) THEN
    ALTER TABLE conversaciones_whatsapp ADD CONSTRAINT chk_conversacion_estado
      CHECK (estado IN ('INICIADA', 'ACTIVA', 'FINALIZADA', 'EXPIRADA', 'BLOQUEADA'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_mensaje_direccion'
      AND conrelid = 'mensajes_whatsapp'::regclass
  ) THEN
    ALTER TABLE mensajes_whatsapp ADD CONSTRAINT chk_mensaje_direccion
      CHECK (direccion IN ('ENTRANTE', 'SALIENTE'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_reserva_estado'
      AND conrelid = 'reservas_temporales'::regclass
  ) THEN
    ALTER TABLE reservas_temporales ADD CONSTRAINT chk_reserva_estado
      CHECK (estado IN ('ACTIVA', 'CONFIRMADA', 'EXPIRADA', 'CANCELADA'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_citas_canal_origen ON citas(canal_origen);
CREATE INDEX IF NOT EXISTS idx_citas_estado_confirmacion ON citas(estado_confirmacion);
CREATE INDEX IF NOT EXISTS idx_citas_profesional_intervalo ON citas(profesional_id, fecha, hora_inicio, hora_fin);
CREATE INDEX IF NOT EXISTS idx_pacientes_telefono_normalizado ON pacientes(telefono_normalizado);
CREATE INDEX IF NOT EXISTS idx_conversaciones_telefono_estado ON conversaciones_whatsapp(telefono, estado);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversaciones_whatsapp_telefono_activa
  ON conversaciones_whatsapp(telefono)
  WHERE estado IN ('INICIADA', 'ACTIVA');
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensajes_whatsapp_message_id_externo
  ON mensajes_whatsapp(message_id_externo)
  WHERE message_id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_intervalo ON reservas_temporales(profesional_id, fecha, hora_inicio, hora_fin, estado);
CREATE INDEX IF NOT EXISTS idx_reservas_expiracion ON reservas_temporales(estado, fecha_expiracion);
CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes ON recordatorios_citas(estado, fecha_programada);
CREATE INDEX IF NOT EXISTS idx_auditoria_whatsapp_cita ON auditoria_whatsapp(cita_id, created_at);

COMMIT;
