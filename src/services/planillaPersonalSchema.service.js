const sequelize = require('../config/database');

let ready = false;

const ensurePlanillaPersonalSchema = async () => {
  if (ready) return;
  await sequelize.query(`
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS fecha_planilla DATE NOT NULL DEFAULT CURRENT_DATE;
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'borrador';
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMP WITH TIME ZONE;
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS reabierta_en TIMESTAMP WITH TIME ZONE;
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS anulada_en TIMESTAMP WITH TIME ZONE;
    ALTER TABLE planillas_personal ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;
    ALTER TABLE planillas_personal_detalle ADD COLUMN IF NOT EXISTS monto_servicio DECIMAL(10,2);
    ALTER TABLE planillas_personal_detalle ADD COLUMN IF NOT EXISTS estado_laboral VARCHAR(20);
    ALTER TABLE planillas_personal_detalle ADD COLUMN IF NOT EXISTS firma VARCHAR(255);
    UPDATE planillas_personal SET estado = 'borrador' WHERE estado IS NULL;
    UPDATE planillas_personal_detalle SET estado_laboral = 'activo' WHERE estado_laboral IS NULL;
    ALTER TABLE planillas_personal_detalle DROP CONSTRAINT IF EXISTS planilla_detalle_tipo_pago_check;
    ALTER TABLE planillas_personal_detalle ADD CONSTRAINT planilla_detalle_tipo_pago_check CHECK (tipo_pago IN ('mensual', 'por_servicio', 'otro'));
    ALTER TABLE personal DROP CONSTRAINT IF EXISTS personal_tipo_pago_check;
    ALTER TABLE personal ADD CONSTRAINT personal_tipo_pago_check CHECK (tipo_pago IN ('mensual', 'por_servicio', 'otro'));
  `);
  ready = true;
};

module.exports = { ensurePlanillaPersonalSchema };
