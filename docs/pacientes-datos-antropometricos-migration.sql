ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS lugar_nacimiento VARCHAR(150),
  ADD COLUMN IF NOT EXISTS peso DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS talla DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS imc DECIMAL(5, 2);

-- Evita CI duplicados sin borrar ni alterar registros existentes.
-- Si esta sentencia falla, primero deben corregirse los CI repetidos.
CREATE UNIQUE INDEX IF NOT EXISTS pacientes_ci_unique
  ON pacientes (ci)
  WHERE ci IS NOT NULL AND BTRIM(ci) <> '';

-- Normaliza el sexo y reemplaza el ENUM anterior por texto controlado.
ALTER TABLE pacientes ALTER COLUMN sexo DROP NOT NULL;
ALTER TABLE pacientes
  ALTER COLUMN sexo TYPE VARCHAR(10)
  USING (
    CASE sexo::text
      WHEN 'M' THEN 'MASCULINO'
      WHEN 'F' THEN 'FEMENINO'
      WHEN 'MASCULINO' THEN 'MASCULINO'
      WHEN 'FEMENINO' THEN 'FEMENINO'
      ELSE NULL
    END
  );

ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_sexo_check;
ALTER TABLE pacientes
  ADD CONSTRAINT pacientes_sexo_check
  CHECK (sexo IN ('MASCULINO', 'FEMENINO'));
