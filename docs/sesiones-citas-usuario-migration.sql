ALTER TABLE sesiones
  ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE citas
  ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sesiones_usuario_id_idx ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS citas_usuario_id_idx ON citas(usuario_id);
