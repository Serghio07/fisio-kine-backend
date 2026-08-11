const { validateRuntimeSchema } = require('./runtimeSchemaValidation.service');

let validationPromise = null;

const ensurePlanillaAtencionSchema = async () => {
  if (!validationPromise) {
    validationPromise = validateRuntimeSchema({
      scope: 'planillas de atencion',
      tables: {
        planillas_atencion_asistencia: ['historia_clinica_id', 'observacion'],
        planilla_sesiones: ['sesion_id', 'observacion']
      },
      indexes: {
        planillas_atencion_asistencia: ['idx_planillas_atencion_historia'],
        planilla_sesiones: ['idx_planilla_sesiones_sesion']
      },
      constraints: {
        planillas_atencion_asistencia: ['planillas_atencion_asistencia_historia_clinica_id_fkey'],
        planilla_sesiones: ['planilla_sesiones_sesion_id_fkey']
      }
    }).catch((error) => {
      validationPromise = null;
      throw error;
    });
  }
  return validationPromise;
};

module.exports = { ensurePlanillaAtencionSchema };
