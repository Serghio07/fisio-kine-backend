BEGIN;

ALTER TABLE pacientes
  ADD COLUMN IF NOT EXISTS telefono_normalizado VARCHAR(15);

WITH telefonos_calculados AS (
  SELECT
    id,
    CASE
      WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') ~ '^00591[0-9]{8}$'
        THEN substring(regexp_replace(telefono, '[^0-9]', '', 'g') FROM 3)
      WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') ~ '^[0-9]{8}$'
        THEN '591' || regexp_replace(telefono, '[^0-9]', '', 'g')
      WHEN regexp_replace(COALESCE(telefono, ''), '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$'
        THEN regexp_replace(telefono, '[^0-9]', '', 'g')
      ELSE NULL
    END AS valor_normalizado
  FROM pacientes
), filas_actualizadas AS (
  UPDATE pacientes AS paciente
  SET telefono_normalizado = calculado.valor_normalizado
  FROM telefonos_calculados AS calculado
  WHERE paciente.id = calculado.id
    AND paciente.telefono_normalizado IS DISTINCT FROM calculado.valor_normalizado
  RETURNING paciente.id
)
SELECT COUNT(*) AS filas_actualizadas
FROM filas_actualizadas;

COMMIT;

SELECT
  left(telefono_normalizado, 3)
    || repeat('*', greatest(length(telefono_normalizado) - 6, 0))
    || right(telefono_normalizado, 3) AS telefono_enmascarado,
  COUNT(*) AS cantidad,
  ARRAY_AGG(id ORDER BY id) AS pacientes
FROM pacientes
WHERE telefono_normalizado IS NOT NULL
GROUP BY telefono_normalizado
HAVING COUNT(*) > 1
ORDER BY cantidad DESC;
