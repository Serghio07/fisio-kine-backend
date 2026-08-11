BEGIN;

ALTER TABLE citas ADD COLUMN IF NOT EXISTS google_event_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS citas_google_event_id_unique
  ON citas (google_event_id) WHERE google_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS google_calendar_integraciones (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token_cifrado TEXT,
  refresh_token_cifrado TEXT NOT NULL,
  expiry_date BIGINT,
  calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMIT;
