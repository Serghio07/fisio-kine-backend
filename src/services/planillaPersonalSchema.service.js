const { validateRuntimeSchema } = require('./runtimeSchemaValidation.service');

let validationPromise = null;

const ensurePlanillaPersonalSchema = async () => {
  if (!validationPromise) {
    validationPromise = validateRuntimeSchema({
      scope: 'planillas de personal',
      tables: {
        planillas_personal: ['fecha_planilla', 'estado', 'cerrada_en', 'reabierta_en', 'anulada_en', 'motivo_anulacion'],
        planillas_personal_detalle: ['monto_servicio', 'estado_laboral', 'firma'],
        personal: []
      },
      constraints: {
        planillas_personal_detalle: ['planilla_detalle_tipo_pago_check'],
        personal: ['personal_tipo_pago_check']
      }
    }).catch((error) => {
      validationPromise = null;
      throw error;
    });
  }
  return validationPromise;
};

module.exports = { ensurePlanillaPersonalSchema };
