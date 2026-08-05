BEGIN;

DO $$
BEGIN
  IF to_regclass('public.whatsapp_eventos') IS NOT NULL THEN
    IF obj_description('public.whatsapp_eventos'::regclass, 'pg_class')
      IS DISTINCT FROM 'CREATED_BY_WHATSAPP_STAGE3_20260803' THEN
      RAISE EXCEPTION
        'whatsapp_eventos no esta identificada como propiedad de la ETAPA 3; rollback detenido.';
    END IF;
    DROP TABLE whatsapp_eventos;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.whatsapp_solicitudes_cita') IS NOT NULL THEN
    IF obj_description('public.whatsapp_solicitudes_cita'::regclass, 'pg_class')
      IS DISTINCT FROM 'CREATED_BY_WHATSAPP_STAGE3_20260803' THEN
      RAISE EXCEPTION
        'whatsapp_solicitudes_cita no esta identificada como propiedad de la ETAPA 3; rollback detenido.';
    END IF;
    DROP TABLE whatsapp_solicitudes_cita;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.idx_pacientes_telefono') IS NOT NULL
    AND obj_description('public.idx_pacientes_telefono'::regclass, 'pg_class')
      = 'CREATED_BY_WHATSAPP_STAGE3_20260803' THEN
    DROP INDEX idx_pacientes_telefono;
  END IF;
END;
$$;

DO $$
DECLARE
  numero_atributo SMALLINT;
BEGIN
  SELECT attnum
  INTO numero_atributo
  FROM pg_attribute
  WHERE attrelid = 'public.pacientes'::regclass
    AND attname = 'registro_pendiente'
    AND NOT attisdropped;

  IF numero_atributo IS NOT NULL
    AND col_description('public.pacientes'::regclass, numero_atributo)
      = 'CREATED_BY_WHATSAPP_STAGE3_20260803' THEN
    ALTER TABLE pacientes DROP COLUMN registro_pendiente;
  END IF;
END;
$$;

COMMIT;
