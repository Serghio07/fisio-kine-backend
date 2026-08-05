BEGIN;

CREATE TABLE IF NOT EXISTS whatsapp_recordatorios_cita (
  id BIGSERIAL PRIMARY KEY,
  cita_id INTEGER NOT NULL REFERENCES citas(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  telefono_normalizado VARCHAR(15) NOT NULL,
  tipo_recordatorio VARCHAR(30) NOT NULL DEFAULT 'CITA_PROXIMA',
  programado_para TIMESTAMPTZ NOT NULL,
  cita_fecha DATE NOT NULL,
  cita_hora_inicio TIME NOT NULL,
  cita_hora_fin TIME,
  cita_estado VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_intento_en TIMESTAMPTZ,
  proximo_intento_en TIMESTAMPTZ,
  aceptado_en TIMESTAMPTZ,
  enviado_en TIMESTAMPTZ,
  entregado_en TIMESTAMPTZ,
  leido_en TIMESTAMPTZ,
  expira_respuesta_en TIMESTAMPTZ,
  respondido_en TIMESTAMPTZ,
  meta_message_id VARCHAR(255),
  idempotency_key VARCHAR(255) NOT NULL,
  respuesta VARCHAR(40),
  error_codigo VARCHAR(100),
  error_categoria VARCHAR(20),
  error_resumen VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_recordatorios_cita_estado_check CHECK (estado IN (
    'PENDIENTE', 'PROCESANDO', 'ACEPTADO', 'ENVIADO', 'ENTREGADO', 'LEIDO',
    'REINTENTO', 'FALLIDO', 'CANCELADO', 'RESPONDIDO', 'EXPIRADO'
  )),
  CONSTRAINT whatsapp_recordatorios_cita_tipo_check CHECK (tipo_recordatorio = 'CITA_PROXIMA'),
  CONSTRAINT whatsapp_recordatorios_cita_intentos_check CHECK (intentos >= 0),
  CONSTRAINT whatsapp_recordatorios_cita_telefono_check CHECK (telefono_normalizado ~ '^[0-9]{5,15}$'),
  CONSTRAINT whatsapp_recordatorios_cita_respuesta_check CHECK (respuesta IS NULL OR respuesta IN (
    'CONFIRMAR_ASISTENCIA', 'NO_ASISTIRA', 'CANCELAR_CITA', 'REPROGRAMAR', 'MANTENER_CITA', 'RECEPCION'
  )),
  CONSTRAINT whatsapp_recordatorios_cita_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT whatsapp_recordatorios_cita_meta_message_id_key UNIQUE (meta_message_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_recordatorios_cita_due_idx
  ON whatsapp_recordatorios_cita (estado, proximo_intento_en);
CREATE INDEX IF NOT EXISTS whatsapp_recordatorios_cita_cita_idx
  ON whatsapp_recordatorios_cita (cita_id);
CREATE INDEX IF NOT EXISTS whatsapp_recordatorios_cita_paciente_idx
  ON whatsapp_recordatorios_cita (paciente_id);

ALTER TABLE whatsapp_conversaciones DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check;
ALTER TABLE whatsapp_conversaciones ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (
  'ESPERANDO_OPCION', 'INICIO_AGENDAR_CITA', 'INICIO_CONSULTAR_CITAS',
  'INICIO_REPROGRAMAR_CANCELAR', 'INICIO_INFORMACION_CENTRO', 'DERIVACION_RECEPCION',
  'ESPERANDO_NOMBRE', 'ESPERANDO_MOTIVO', 'ESPERANDO_FECHA_PREFERIDA',
  'ESPERANDO_TURNO_PREFERIDO', 'ESPERANDO_HORA_PREFERIDA',
  'ESPERANDO_CONFIRMACION_SOLICITUD', 'ESPERANDO_CAMPO_A_MODIFICAR', 'SOLICITUD_CREADA',
  'BUSCANDO_DISPONIBILIDAD', 'ESPERANDO_SELECCION_HORARIO', 'SIN_DISPONIBILIDAD',
  'ESPERANDO_NUEVA_FECHA', 'HORARIO_SELECCIONADO', 'ESPERANDO_CONFIRMACION_FINAL',
  'CITA_CREADA', 'DERIVADA_RECEPCION', 'ESPERANDO_SELECCION_CITA',
  'MOSTRANDO_DETALLE_CITA', 'ESPERANDO_ACCION_CITA', 'ESPERANDO_CONFIRMACION_CANCELACION',
  'ESPERANDO_FECHA_REPROGRAMACION', 'ESPERANDO_HORARIO_REPROGRAMACION',
  'ESPERANDO_CONFIRMACION_REPROGRAMACION', 'CITA_CANCELADA', 'CITA_REPROGRAMADA',
  'ESPERANDO_RESPUESTA_RECORDATORIO', 'ESPERANDO_CONFIRMACION_NO_ASISTIRA',
  'ASISTENCIA_CONFIRMADA', 'RECORDATORIO_DERIVADO_RECEPCION'
));

COMMIT;
