ALTER TABLE citas ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER REFERENCES historias_clinicas(id);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS profesional_id INTEGER REFERENCES usuarios(id);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS sesion_id INTEGER REFERENCES sesiones(id);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS numero_sesion INTEGER;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS total_sesiones INTEGER;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS origen VARCHAR(80) NOT NULL DEFAULT 'Agenda manual';
ALTER TABLE citas ADD COLUMN IF NOT EXISTS fecha_programada_original DATE;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS hora_inicio_original TIME;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS hora_fin_original TIME;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS motivo_cambio TEXT;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS historial_programacion JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS citas_programacion_sesion_activa_uq
ON citas(historia_clinica_id, numero_sesion)
WHERE origen = 'Plan de tratamiento' AND estado NOT IN ('Cancelada', 'Reprogramada');

CREATE INDEX IF NOT EXISTS citas_programacion_historia_idx
ON citas(historia_clinica_id, fecha, hora_inicio);

ALTER TABLE citas DROP CONSTRAINT IF EXISTS chk_citas_estado;
ALTER TABLE citas ADD CONSTRAINT chk_citas_estado CHECK (
  estado IN ('Pendiente', 'Programada', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio', 'Falto')
);

ALTER TABLE citas DROP CONSTRAINT IF EXISTS chk_citas_tipo_atencion;
ALTER TABLE citas ADD CONSTRAINT chk_citas_tipo_atencion CHECK (
  tipo_atencion IS NULL OR tipo_atencion IN (
    'Primera consulta', 'Sesion de fisioterapia', 'Sesion de tratamiento',
    'Evaluacion', 'Control', 'Rehabilitacion', 'Otro'
  )
);
