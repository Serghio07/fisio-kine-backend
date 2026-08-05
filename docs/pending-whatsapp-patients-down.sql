BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pacientes WHERE ci IS NULL OR sexo IS NULL) THEN
    RAISE EXCEPTION 'No se puede restaurar NOT NULL mientras existan pacientes pendientes incompletos';
  END IF;
END $$;
ALTER TABLE pacientes ALTER COLUMN ci SET NOT NULL;
ALTER TABLE pacientes ALTER COLUMN sexo SET NOT NULL;
COMMIT;
