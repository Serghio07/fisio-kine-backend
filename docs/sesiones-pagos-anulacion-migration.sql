ALTER TABLE sesiones
  ADD COLUMN IF NOT EXISTS monto_sesion NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monto_sesion >= 0),
  ADD COLUMN IF NOT EXISTS monto_pagado NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
  ADD COLUMN IF NOT EXISTS saldo_pendiente NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  ADD COLUMN IF NOT EXISTS anulada BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS anulada_por VARCHAR(150),
  ADD COLUMN IF NOT EXISTS motivo_anulacion VARCHAR(80),
  ADD COLUMN IF NOT EXISTS observacion_anulacion TEXT;

ALTER TABLE sesiones
  DROP CONSTRAINT IF EXISTS sesiones_metodo_pago_check,
  DROP CONSTRAINT IF EXISTS chk_sesiones_metodo_pago,
  DROP CONSTRAINT IF EXISTS sesiones_estado_pago_check,
  DROP CONSTRAINT IF EXISTS chk_sesiones_estado_pago;

ALTER TABLE sesiones
  ADD CONSTRAINT chk_sesiones_metodo_pago
  CHECK (metodo_pago IN ('QR', 'Efectivo', 'Transferencia', 'Pendiente', 'Otro'));

ALTER TABLE sesiones
  ADD CONSTRAINT chk_sesiones_estado_pago
  CHECK (estado_pago IN ('Pagado', 'Pendiente', 'Parcial', 'Debe'));

UPDATE sesiones
SET saldo_pendiente = GREATEST(monto_sesion - monto_pagado, 0)
WHERE saldo_pendiente IS NULL OR saldo_pendiente < 0;

CREATE INDEX IF NOT EXISTS idx_sesiones_anulada ON sesiones(anulada);
CREATE INDEX IF NOT EXISTS idx_sesiones_historia_anulada ON sesiones(historia_clinica_id, anulada);
