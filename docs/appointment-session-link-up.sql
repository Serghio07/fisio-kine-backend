BEGIN;
ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS chk_sesiones_estado_pago;
ALTER TABLE sesiones ADD CONSTRAINT chk_sesiones_estado_pago CHECK (estado_pago IN ('Pagado','Pendiente','Parcial','Debe','Sin costo'));
CREATE UNIQUE INDEX IF NOT EXISTS citas_sesion_id_unique ON citas(sesion_id) WHERE sesion_id IS NOT NULL;
COMMIT;
