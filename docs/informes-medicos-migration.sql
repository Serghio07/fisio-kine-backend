CREATE TABLE IF NOT EXISTS informes_medicos (
    id SERIAL PRIMARY KEY,
    paciente_id INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    historia_clinica_id INT NOT NULL REFERENCES historias_clinicas(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    doctor VARCHAR(150),
    diagnostico TEXT NOT NULL,
    dx_cie TEXT,
    antecedentes TEXT,
    conclusion_diagnostica TEXT,
    cantidad_sesiones INT,
    tratamiento_fisioterapeutico TEXT,
    medicamentos TEXT,
    estado_actual TEXT,
    observacion_final TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_informes_medicos_paciente ON informes_medicos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_informes_medicos_historia ON informes_medicos(historia_clinica_id);
CREATE INDEX IF NOT EXISTS idx_informes_medicos_fecha ON informes_medicos(fecha);

CREATE OR REPLACE FUNCTION actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_informes_medicos_updated ON informes_medicos;
CREATE TRIGGER trg_informes_medicos_updated
BEFORE UPDATE ON informes_medicos
FOR EACH ROW
EXECUTE FUNCTION actualizar_updated_at();
