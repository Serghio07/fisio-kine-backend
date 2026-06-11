CREATE TABLE IF NOT EXISTS planillas_atencion_asistencia (
    id SERIAL PRIMARY KEY,
    paciente_id INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    fecha_inicio DATE,
    fecha_fin DATE,
    diagnostico TEXT,
    observacion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planilla_sesiones (
    id SERIAL PRIMARY KEY,
    planilla_id INT NOT NULL REFERENCES planillas_atencion_asistencia(id) ON DELETE CASCADE,
    paciente_id INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    numero_sesion INT NOT NULL,
    firma_paciente VARCHAR(180),
    firma_profesional VARCHAR(180),
    observacion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (planilla_id, numero_sesion)
);

CREATE INDEX IF NOT EXISTS idx_planillas_atencion_paciente ON planillas_atencion_asistencia(paciente_id);
CREATE INDEX IF NOT EXISTS idx_planilla_sesiones_planilla ON planilla_sesiones(planilla_id);
CREATE INDEX IF NOT EXISTS idx_planilla_sesiones_paciente ON planilla_sesiones(paciente_id);
