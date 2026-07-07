require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      ALTER TABLE historias_clinicas
      ADD COLUMN IF NOT EXISTS evolutivo JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await sequelize.query("ALTER TABLE historias_clinicas ALTER COLUMN estado DROP DEFAULT");
    await sequelize.query("ALTER TABLE historias_clinicas ALTER COLUMN estado TYPE VARCHAR(10) USING estado::text");
    await sequelize.query("UPDATE historias_clinicas SET estado = 'activa' WHERE estado = 'cerrada'");
    await sequelize.query("ALTER TABLE historias_clinicas ALTER COLUMN estado SET DEFAULT 'borrador'");
    await sequelize.query("ALTER TABLE condicion_actual ALTER COLUMN tipo_lesion TYPE VARCHAR(100) USING tipo_lesion::text");
    await sequelize.query(`
      ALTER TABLE intervencion_clinica
      ALTER COLUMN trofismo TYPE VARCHAR(20)
      USING CASE
        WHEN UPPER(trofismo::text) = 'CONSERVADO' THEN 'CONSERVADO'
        WHEN UPPER(trofismo::text) = 'AUMENTADO' THEN 'AUMENTADO'
        ELSE 'DISMINUIDO'
      END
    `);
    console.log('Evolutivo habilitado en historias clinicas.');
  } catch (error) {
    console.error('No se pudo habilitar el evolutivo:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

migrate();
