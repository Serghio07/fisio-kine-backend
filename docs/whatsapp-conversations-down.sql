BEGIN;
DO $$
BEGIN
  IF to_regclass('public.whatsapp_conversaciones') IS NOT NULL THEN
    DROP TABLE whatsapp_conversaciones;
  END IF;
END $$;
COMMIT;
