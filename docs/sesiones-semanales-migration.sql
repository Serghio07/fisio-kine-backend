DO $$ BEGIN
    CREATE TYPE sexo_paciente AS ENUM ('M', 'F', 'Otro');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS registro_semanal (
    id SERIAL PRIMARY KEY,
    semana_inicio DATE NOT NULL,
    semana_fin DATE NOT NULL,
    paciente_id INT NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    diagnostico TEXT,
    telefono VARCHAR(30),
    edad INT,
    sexo sexo_paciente,
    lunes VARCHAR(30),
    martes VARCHAR(30),
    miercoles VARCHAR(30),
    jueves VARCHAR(30),
    viernes VARCHAR(30),
    sabado VARCHAR(30),
    aplica_farmacos BOOLEAN DEFAULT false,
    debe_bs DECIMAL(10,2) DEFAULT 0,
    observacion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registro_semanal_paciente ON registro_semanal(paciente_id);
CREATE INDEX IF NOT EXISTS idx_registro_semanal_semana ON registro_semanal(semana_inicio, semana_fin);
