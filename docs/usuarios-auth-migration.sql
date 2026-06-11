ALTER TABLE usuarios
ALTER COLUMN estado DROP DEFAULT;

ALTER TABLE usuarios
ALTER COLUMN estado TYPE VARCHAR(20)
USING CASE
    WHEN estado::text IN ('true', 't', '1', 'activo') THEN 'activo'
    WHEN estado::text IN ('false', 'f', '0', 'inactivo') THEN 'inactivo'
    ELSE 'activo'
END;

UPDATE usuarios SET estado = 'activo' WHERE estado IS NULL;

ALTER TABLE usuarios
ALTER COLUMN estado SET NOT NULL,
ALTER COLUMN estado SET DEFAULT 'activo';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_usuarios_estado'
    ) THEN
        ALTER TABLE usuarios
        ADD CONSTRAINT chk_usuarios_estado CHECK (estado IN ('activo', 'inactivo'));
    END IF;
END $$;
