const sequelize = require('../config/database');

const run = async () => {
  const [database] = await sequelize.query('SELECT current_database() AS database, current_user AS usuario');
  const [counts] = await sequelize.query(`
    SELECT count(*)::integer AS total,
           count(*) FILTER (WHERE telefono IS NULL)::integer AS telefono_null,
           count(*) FILTER (WHERE telefono_normalizado IS NULL)::integer AS telefono_normalizado_null
    FROM pacientes
  `);
  const [columns] = await sequelize.query(`
    SELECT column_name, is_nullable, data_type, character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pacientes'
      AND column_name IN ('telefono', 'telefono_normalizado')
    ORDER BY column_name
  `);
  const [indexes] = await sequelize.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'pacientes'
      AND indexdef ILIKE '%telefono_normalizado%'
  `);
  console.log(JSON.stringify({ target: database[0], counts: counts[0], columns, indexes }, null, 2));
};

run().finally(() => sequelize.close());
