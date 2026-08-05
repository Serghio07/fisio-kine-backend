BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pacientes'
      AND column_name = 'telefono_normalizado'
  ) THEN
    RAISE EXCEPTION 'No se puede crear la restricción: telefono_normalizado no existe';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pacientes
    WHERE telefono_normalizado IS NOT NULL
    GROUP BY telefono_normalizado
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'No se puede crear la restricción: existen teléfonos normalizados duplicados';
  END IF;
END $$;

ALTER TABLE pacientes
  ALTER COLUMN telefono_normalizado SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_telefono_normalizado_unique
  ON pacientes (telefono_normalizado);

COMMIT;
