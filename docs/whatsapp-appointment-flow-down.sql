BEGIN;
ALTER TABLE whatsapp_conversaciones
  DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check;
ALTER TABLE whatsapp_conversaciones
  ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (
    'ESPERANDO_OPCION', 'INICIO_AGENDAR_CITA', 'INICIO_CONSULTAR_CITAS',
    'INICIO_REPROGRAMAR_CANCELAR', 'INICIO_INFORMACION_CENTRO', 'DERIVACION_RECEPCION'
  ));
COMMIT;
