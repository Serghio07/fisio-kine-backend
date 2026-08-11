const sequelize = require('../config/database');

const pendingMigrationError = (scope, missing) => {
  const detail = missing.join(', ');
  console.error(`[Schema] Migracion pendiente para ${scope}: ${detail}`);
  const error = new Error(`Esquema incompleto para ${scope}. Ejecute las migraciones pendientes.`);
  error.code = 'SCHEMA_MIGRATION_REQUIRED';
  error.status = 503;
  error.missingSchemaObjects = [...missing];
  return error;
};

const validateRuntimeSchema = async ({ scope, tables, indexes = {}, constraints = {} }) => {
  const queryInterface = sequelize.getQueryInterface();
  const missing = [];

  for (const [tableName, requiredColumns] of Object.entries(tables)) {
    let columns;
    try {
      columns = await queryInterface.describeTable(tableName);
    } catch {
      missing.push(`tabla ${tableName}`);
      continue;
    }

    for (const columnName of requiredColumns) {
      if (!columns[columnName]) missing.push(`columna ${tableName}.${columnName}`);
    }

    const requiredIndexes = indexes[tableName] || [];
    if (requiredIndexes.length) {
      const currentIndexes = await queryInterface.showIndex(tableName);
      const names = new Set(currentIndexes.map((item) => item.name));
      for (const indexName of requiredIndexes) {
        if (!names.has(indexName)) missing.push(`indice ${indexName}`);
      }
    }

    const requiredConstraints = constraints[tableName] || [];
    if (requiredConstraints.length) {
      const [rows] = await sequelize.query(
        `SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND conrelid = :tableName::regclass`,
        { replacements: { tableName } }
      );
      const names = new Set(rows.map((item) => item.conname));
      for (const constraintName of requiredConstraints) {
        if (!names.has(constraintName)) missing.push(`constraint ${constraintName}`);
      }
    }
  }

  if (missing.length) throw pendingMigrationError(scope, missing);
};

module.exports = { pendingMigrationError, validateRuntimeSchema };
