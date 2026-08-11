BEGIN;
DROP TABLE IF EXISTS google_calendar_integraciones;
DROP INDEX IF EXISTS citas_google_event_id_unique;
ALTER TABLE citas DROP COLUMN IF EXISTS google_event_id;
COMMIT;
