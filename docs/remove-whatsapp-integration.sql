BEGIN;

DROP TABLE IF EXISTS recordatorios_citas CASCADE;
DROP TABLE IF EXISTS mensajes_whatsapp CASCADE;
DROP TABLE IF EXISTS auditoria_whatsapp CASCADE;
DROP TABLE IF EXISTS reservas_temporales CASCADE;
DROP TABLE IF EXISTS conversaciones_whatsapp CASCADE;
DROP TABLE IF EXISTS bloqueos_agenda CASCADE;
DROP TABLE IF EXISTS configuracion_tipos_atencion CASCADE;

ALTER TABLE citas
  DROP COLUMN IF EXISTS canal_origen,
  DROP COLUMN IF EXISTS referencia_origen,
  DROP COLUMN IF EXISTS estado_confirmacion,
  DROP COLUMN IF EXISTS fecha_confirmacion,
  DROP COLUMN IF EXISTS whatsapp_message_id,
  DROP COLUMN IF EXISTS whatsapp_conversation_id,
  DROP COLUMN IF EXISTS reserva_temporal_id,
  DROP COLUMN IF EXISTS paciente_verificado,
  DROP COLUMN IF EXISTS metodo_verificacion,
  DROP COLUMN IF EXISTS fecha_ultima_notificacion,
  DROP COLUMN IF EXISTS motivo_reprogramacion,
  DROP COLUMN IF EXISTS canal_cancelacion,
  DROP COLUMN IF EXISTS fecha_cancelacion;

ALTER TABLE pacientes
  DROP COLUMN IF EXISTS estado_registro,
  DROP COLUMN IF EXISTS origen_registro,
  DROP COLUMN IF EXISTS origen_registro_detalle,
  DROP COLUMN IF EXISTS datos_clinicos_estado,
  DROP COLUMN IF EXISTS tipo_documento,
  DROP COLUMN IF EXISTS ci_numero,
  DROP COLUMN IF EXISTS ci_complemento,
  DROP COLUMN IF EXISTS ci_expedido,
  DROP COLUMN IF EXISTS telefono_normalizado,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS consentimiento_datos_en;

COMMIT;
