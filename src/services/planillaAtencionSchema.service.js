const sequelize = require('../config/database');

let ready = false;

const ensurePlanillaAtencionSchema = async () => {
  if (ready) return;
  await sequelize.query(`
    ALTER TABLE planillas_atencion_asistencia
      ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER REFERENCES historias_clinicas(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS observacion TEXT;
    ALTER TABLE planilla_sesiones
      ADD COLUMN IF NOT EXISTS sesion_id INTEGER REFERENCES sesiones(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS observacion TEXT;
    CREATE INDEX IF NOT EXISTS idx_planillas_atencion_historia ON planillas_atencion_asistencia(historia_clinica_id);
    CREATE INDEX IF NOT EXISTS idx_planilla_sesiones_sesion ON planilla_sesiones(sesion_id);
  `);
  await sequelize.query(`
    UPDATE planilla_sesiones ps
    SET sesion_id = matches.sesion_id
    FROM (
      SELECT ps2.id AS fila_id, MIN(s.id) AS sesion_id
      FROM planilla_sesiones ps2
      JOIN sesiones s
        ON s.paciente_id = ps2.paciente_id
       AND s.fecha = ps2.fecha
       AND s.numero_sesion = ps2.numero_sesion
       AND COALESCE(s.anulada, FALSE) = FALSE
      WHERE ps2.sesion_id IS NULL
      GROUP BY ps2.id
      HAVING COUNT(s.id) = 1
    ) matches
    WHERE ps.id = matches.fila_id;

    UPDATE planillas_atencion_asistencia pa
    SET historia_clinica_id = matches.historia_clinica_id
    FROM (
      SELECT ps.planilla_id, MIN(s.historia_clinica_id) AS historia_clinica_id
      FROM planilla_sesiones ps
      JOIN sesiones s ON s.id = ps.sesion_id
      WHERE s.historia_clinica_id IS NOT NULL
      GROUP BY ps.planilla_id
      HAVING COUNT(DISTINCT s.historia_clinica_id) = 1
    ) matches
    WHERE pa.id = matches.planilla_id
      AND pa.historia_clinica_id IS NULL;
  `);
  ready = true;
};

module.exports = { ensurePlanillaAtencionSchema };
