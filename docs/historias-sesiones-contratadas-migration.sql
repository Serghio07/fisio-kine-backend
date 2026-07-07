ALTER TABLE evaluacion_final
  ADD COLUMN IF NOT EXISTS sesiones_contratadas INT NOT NULL DEFAULT 1 CHECK (sesiones_contratadas >= 1);

ALTER TABLE sesiones
  ADD COLUMN IF NOT EXISTS historia_clinica_id INT;

CREATE INDEX IF NOT EXISTS idx_sesiones_historia_clinica_id
  ON sesiones(historia_clinica_id);

ALTER TABLE sesiones
  DROP CONSTRAINT IF EXISTS sesiones_historia_clinica_id_fkey;

ALTER TABLE sesiones
  ADD CONSTRAINT sesiones_historia_clinica_id_fkey
  FOREIGN KEY (historia_clinica_id)
  REFERENCES historias_clinicas(id)
  ON DELETE SET NULL;
