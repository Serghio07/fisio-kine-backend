const { validateRuntimeSchema } = require('./runtimeSchemaValidation.service');

let schemaReadyPromise = null;

const ensureRegistroSemanalSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = validateRuntimeSchema({
      scope: 'registro y sincronizacion semanal',
      tables: {
        registro_semanal: [
          'historia_clinica_id',
          'sesiones_resumen',
          'total_sesiones',
          'sincronizado_sesiones',
          'generado_automaticamente'
        ]
      },
      indexes: { registro_semanal: ['idx_registro_semanal_historia'] }
    }).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

module.exports = {
  ensureRegistroSemanalSchema
};
