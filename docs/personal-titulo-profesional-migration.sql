ALTER TABLE personal
  ADD COLUMN IF NOT EXISTS titulo_profesional VARCHAR(10);

ALTER TABLE personal
  DROP CONSTRAINT IF EXISTS personal_titulo_profesional_check;

ALTER TABLE personal
  ADD CONSTRAINT personal_titulo_profesional_check
  CHECK (
    titulo_profesional IS NULL
    OR titulo_profesional IN ('Doc.', 'Dr.', 'Dra.', 'Lic.', 'Sr.', 'Sra.')
  );
