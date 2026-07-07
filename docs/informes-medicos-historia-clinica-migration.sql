ALTER TABLE informes_medicos
ADD COLUMN IF NOT EXISTS historia_clinica_id INT;

UPDATE informes_medicos informe
SET historia_clinica_id = (
    SELECT id
    FROM historias_clinicas
    WHERE paciente_id = informe.paciente_id
      AND COALESCE(anulada, FALSE) = FALSE
      AND COALESCE(estado, 'activa') = 'activa'
    ORDER BY fecha_evaluacion DESC, id DESC
    LIMIT 1
)
WHERE informe.historia_clinica_id IS NULL
  AND EXISTS (
      SELECT 1
      FROM historias_clinicas historia
      WHERE historia.paciente_id = informe.paciente_id
        AND COALESCE(historia.anulada, FALSE) = FALSE
        AND COALESCE(historia.estado, 'activa') = 'activa'
  );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_informes_medicos_historia'
    ) THEN
        ALTER TABLE informes_medicos
        ADD CONSTRAINT fk_informes_medicos_historia
        FOREIGN KEY (historia_clinica_id) REFERENCES historias_clinicas(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_informes_medicos_historia
ON informes_medicos(historia_clinica_id);
