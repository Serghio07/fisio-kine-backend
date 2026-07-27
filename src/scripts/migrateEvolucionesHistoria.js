require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'historias_clinicas' AND column_name = 'evolutivo'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'historias_clinicas' AND column_name = 'evoluciones'
        ) THEN
          ALTER TABLE historias_clinicas RENAME COLUMN evolutivo TO evoluciones;
        ELSIF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'historias_clinicas' AND column_name = 'evolutivo'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'historias_clinicas' AND column_name = 'evoluciones'
        ) THEN
          UPDATE historias_clinicas
          SET evoluciones = evolutivo
          WHERE jsonb_array_length(COALESCE(evoluciones, '[]'::jsonb)) = 0
            AND jsonb_array_length(COALESCE(evolutivo, '[]'::jsonb)) > 0;
          ALTER TABLE historias_clinicas DROP COLUMN evolutivo;
        ELSE
          ALTER TABLE historias_clinicas
          ADD COLUMN IF NOT EXISTS evoluciones JSONB NOT NULL DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `, { transaction });
    await transaction.commit();
    console.log('Columna de evoluciones migrada correctamente sin perder registros.');
  } catch (error) {
    await transaction.rollback();
    console.error('No se pudo migrar la columna de evoluciones:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

migrate();
