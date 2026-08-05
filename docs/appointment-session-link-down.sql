BEGIN;
DROP INDEX IF EXISTS citas_sesion_id_unique;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM sesiones WHERE estado_pago='Sin costo') THEN
    RAISE EXCEPTION 'No se puede revertir: existen sesiones con estado_pago Sin costo';
  END IF;
END $$;
ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS chk_sesiones_estado_pago;
ALTER TABLE sesiones ADD CONSTRAINT chk_sesiones_estado_pago CHECK (estado_pago IN ('Pagado','Pendiente','Parcial','Debe'));
COMMIT;
