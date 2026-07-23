require('dotenv').config();
const sequelize = require('../config/database');

async function migrate() {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE sesiones
        ADD COLUMN IF NOT EXISTS medios_fisicos TEXT,
        ADD COLUMN IF NOT EXISTS tecnicas_manuales TEXT,
        ADD COLUMN IF NOT EXISTS descripcion_tratamiento TEXT,
        ADD COLUMN IF NOT EXISTS evolucion_observada TEXT,
        ADD COLUMN IF NOT EXISTS dolor_antes INTEGER,
        ADD COLUMN IF NOT EXISTS dolor_despues INTEGER,
        ADD COLUMN IF NOT EXISTS inyectable_nombre VARCHAR(180),
        ADD COLUMN IF NOT EXISTS inyectable_dosis VARCHAR(180),
        ADD COLUMN IF NOT EXISTS profesional_responsable VARCHAR(180)
    `);
    await sequelize.query('ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS sesiones_dolor_antes_check');
    await sequelize.query('ALTER TABLE sesiones DROP CONSTRAINT IF EXISTS sesiones_dolor_despues_check');
    await sequelize.query('ALTER TABLE sesiones ADD CONSTRAINT sesiones_dolor_antes_check CHECK (dolor_antes IS NULL OR dolor_antes BETWEEN 0 AND 10)');
    await sequelize.query('ALTER TABLE sesiones ADD CONSTRAINT sesiones_dolor_despues_check CHECK (dolor_despues IS NULL OR dolor_despues BETWEEN 0 AND 10)');
    const [historias] = await sequelize.query('SELECT id, evolutivo FROM historias_clinicas WHERE jsonb_array_length(COALESCE(evolutivo, \'[]\'::jsonb)) > 0');
    for (const historia of historias) {
      const [sesiones] = await sequelize.query('SELECT * FROM sesiones WHERE historia_clinica_id = :historiaId ORDER BY fecha, id', { replacements: { historiaId: historia.id } });
      let cambio = false;
      const evolutivos = (historia.evolutivo || []).map((evolutivo) => {
        if (evolutivo.sesion_id) return evolutivo;
        const sesion = sesiones.find((item) => String(item.fecha) === String(evolutivo.fecha_sesion || evolutivo.fecha) && Number(item.numero_sesion) === Number(evolutivo.numero_sesion || evolutivo.numero))
          || sesiones.find((item) => Number(item.numero_sesion) === Number(evolutivo.numero_sesion || evolutivo.numero));
        if (!sesion) return evolutivo;
        cambio = true;
        return { ...evolutivo, sesion_id: sesion.id };
      });
      if (cambio) await sequelize.query('UPDATE historias_clinicas SET evolutivo = CAST(:evolutivo AS jsonb) WHERE id = :id', { replacements: { evolutivo: JSON.stringify(evolutivos), id: historia.id } });
    }
    console.log('Campos clínicos de sesión y sincronización de evolutivos habilitados.');
  } catch (error) {
    console.error('No se pudo migrar las sesiones clínicas:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
