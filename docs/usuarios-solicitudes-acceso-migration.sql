BEGIN;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS telefono VARCHAR(30),
ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

ALTER TABLE usuarios
DROP CONSTRAINT IF EXISTS chk_usuarios_estado;

UPDATE usuarios
SET activo = CASE WHEN estado = 'activo' THEN TRUE ELSE FALSE END
WHERE activo IS NULL OR estado <> 'activo';

ALTER TABLE usuarios
ADD CONSTRAINT chk_usuarios_estado
CHECK (estado IN ('pendiente', 'activo', 'inactivo', 'bloqueado', 'rechazado'));

CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios (estado);
CREATE INDEX IF NOT EXISTS idx_usuarios_bloqueado_hasta ON usuarios (bloqueado_hasta);

COMMIT;
