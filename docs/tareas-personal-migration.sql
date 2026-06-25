CREATE TABLE IF NOT EXISTS tareas_personal (
  id SERIAL PRIMARY KEY,
  personal_id INTEGER REFERENCES personal(id) ON DELETE SET NULL,
  asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  titulo VARCHAR(180) NOT NULL,
  descripcion TEXT,
  fecha DATE NOT NULL,
  hora TIME,
  prioridad VARCHAR(15) NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja', 'media', 'alta')),
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_progreso', 'completada', 'cancelada')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tareas_personal_fecha_idx ON tareas_personal(fecha);
CREATE INDEX IF NOT EXISTS tareas_personal_personal_idx ON tareas_personal(personal_id);
