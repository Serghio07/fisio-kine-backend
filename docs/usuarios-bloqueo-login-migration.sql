ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE usuarios
DROP CONSTRAINT IF EXISTS chk_usuarios_estado;

ALTER TABLE usuarios
ADD CONSTRAINT chk_usuarios_estado CHECK (estado IN ('activo', 'inactivo', 'bloqueado'));

UPDATE usuarios
SET intentos_fallidos = 0
WHERE intentos_fallidos IS NULL;
