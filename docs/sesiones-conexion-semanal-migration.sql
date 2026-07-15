ALTER TYPE estado_asistencia ADD VALUE IF NOT EXISTS 'reprogramada';

BEGIN;

ALTER TABLE sesiones
ADD COLUMN IF NOT EXISTS estado_pago VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
ADD COLUMN IF NOT EXISTS aplica_farmacos BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS observacion_farmacos TEXT;

ALTER TABLE sesiones
DROP CONSTRAINT IF EXISTS chk_sesiones_estado_pago;

ALTER TABLE sesiones
ADD CONSTRAINT chk_sesiones_estado_pago
CHECK (estado_pago IN ('Pagado', 'Pendiente', 'Parcial'));

ALTER TABLE registro_semanal
ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER REFERENCES historias_clinicas(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sesiones_resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS total_sesiones INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sincronizado_sesiones BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS generado_automaticamente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_registro_semanal_sincronizado
ON registro_semanal (sincronizado_sesiones);

CREATE INDEX IF NOT EXISTS idx_registro_semanal_historia
ON registro_semanal (historia_clinica_id);

COMMIT;
