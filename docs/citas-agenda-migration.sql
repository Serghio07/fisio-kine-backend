CREATE TABLE IF NOT EXISTS citas (
    id SERIAL PRIMARY KEY,
    paciente_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME,
    motivo VARCHAR(255),
    tipo_atencion VARCHAR(100),
    estado VARCHAR(50) NOT NULL DEFAULT 'Pendiente',
    observacion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_citas_paciente
        FOREIGN KEY (paciente_id)
        REFERENCES pacientes(id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_citas_estado
        CHECK (estado IN ('Pendiente', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio')),
    CONSTRAINT chk_citas_tipo_atencion
        CHECK (
            tipo_atencion IS NULL
            OR tipo_atencion IN ('Primera consulta', 'Sesion de fisioterapia', 'Evaluacion', 'Control', 'Rehabilitacion', 'Otro')
        ),
    CONSTRAINT chk_citas_horas
        CHECK (hora_fin IS NULL OR hora_fin > hora_inicio)
);

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS paciente_id INTEGER;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS fecha DATE;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS hora_inicio TIME;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS hora_fin TIME;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS motivo VARCHAR(255);

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS tipo_atencion VARCHAR(100);

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'Pendiente';

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS observacion TEXT;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE citas
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'citas'
          AND column_name = 'hora'
    ) THEN
        UPDATE citas
        SET hora_inicio = hora::time
        WHERE hora_inicio IS NULL
          AND hora IS NOT NULL;

        ALTER TABLE citas
        ALTER COLUMN hora DROP NOT NULL;
    END IF;
END $$;

UPDATE citas SET estado = 'Pendiente' WHERE estado IS NULL;

ALTER TABLE citas
ALTER COLUMN paciente_id SET NOT NULL,
ALTER COLUMN fecha SET NOT NULL,
ALTER COLUMN hora_inicio SET NOT NULL,
ALTER COLUMN estado SET NOT NULL,
ALTER COLUMN estado SET DEFAULT 'Pendiente';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_citas_paciente'
    ) THEN
        ALTER TABLE citas
        ADD CONSTRAINT fk_citas_paciente
            FOREIGN KEY (paciente_id)
            REFERENCES pacientes(id)
            ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_citas_estado'
    ) THEN
        ALTER TABLE citas
        ADD CONSTRAINT chk_citas_estado
            CHECK (estado IN ('Pendiente', 'Confirmada', 'Atendida', 'Cancelada', 'Reprogramada', 'No asistio'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_citas_tipo_atencion'
    ) THEN
        ALTER TABLE citas
        ADD CONSTRAINT chk_citas_tipo_atencion
            CHECK (
                tipo_atencion IS NULL
                OR tipo_atencion IN ('Primera consulta', 'Sesion de fisioterapia', 'Evaluacion', 'Control', 'Rehabilitacion', 'Otro')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_citas_horas'
    ) THEN
        ALTER TABLE citas
        ADD CONSTRAINT chk_citas_horas
            CHECK (hora_fin IS NULL OR hora_fin > hora_inicio);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_citas_paciente_id ON citas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_fecha_hora ON citas(fecha, hora_inicio);
