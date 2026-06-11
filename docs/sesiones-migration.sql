-- Ejecuta esto si ya tienes creada la tabla sesiones con el SQL inicial.
-- No borra datos existentes.

ALTER TYPE estado_asistencia ADD VALUE IF NOT EXISTS 'no_asistio';
ALTER TYPE estado_asistencia ADD VALUE IF NOT EXISTS 'cancelada';

ALTER TABLE sesiones
ADD COLUMN IF NOT EXISTS sesiones_debe INT DEFAULT 0 CHECK (sesiones_debe >= 0);

ALTER TABLE sesiones
ADD COLUMN IF NOT EXISTS sesiones_hizo INT DEFAULT 0 CHECK (sesiones_hizo >= 0);

ALTER TABLE sesiones
ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(30) DEFAULT 'Pendiente';

ALTER TABLE sesiones
ALTER COLUMN numero_sesion SET DEFAULT 1;
