const test = require('node:test');
const assert = require('node:assert/strict');
const Sequelize = require('sequelize');
const { pendingMigrationError } = require('../src/services/runtimeSchemaValidation.service');

const migrationFiles = [
  '20260811000100-formalize-planilla-atencion-schema.js',
  '20260811000200-formalize-planilla-personal-schema.js',
  '20260811000300-formalize-registro-semanal-schema.js'
];

const createQueryInterfaceMock = () => {
  const columns = new Map();
  const indexes = new Map();
  const constraints = new Map();
  const operations = [];
  const list = (store, table) => store.get(table) || [];

  const queryInterface = {
    sequelize: {
      transaction: async (callback) => callback({}),
      query: async () => { operations.push('backfill'); return []; }
    },
    describeTable: async (table) => Object.fromEntries(list(columns, table).map((name) => [name, {}])),
    addColumn: async (table, column) => {
      columns.set(table, [...list(columns, table), column]);
      operations.push(`column:${table}.${column}`);
    },
    showIndex: async (table) => list(indexes, table).map((name) => ({ name })),
    addIndex: async (table, fields, options) => {
      indexes.set(table, [...list(indexes, table), options.name]);
      operations.push(`index:${options.name}`);
    },
    showConstraint: async (table) => list(constraints, table).map((constraintName) => ({ constraintName })),
    addConstraint: async (table, options) => {
      constraints.set(table, [...list(constraints, table), options.name]);
      operations.push(`constraint:${options.name}`);
    }
  };
  return { queryInterface, operations };
};

test('error de esquema incompleto es controlado y exige migracion', () => {
  const error = pendingMigrationError('prueba', ['columna ejemplo.valor']);
  assert.equal(error.status, 503);
  assert.equal(error.code, 'SCHEMA_MIGRATION_REQUIRED');
  assert.match(error.message, /migraciones pendientes/);
});

for (const file of migrationFiles) {
  test(`${file} es cargable e idempotente a nivel estructural`, async () => {
    const migration = require(`../migrations/${file}`);
    const { queryInterface, operations } = createQueryInterfaceMock();
    await migration.up(queryInterface, Sequelize);
    const structuralCount = operations.filter((item) => item !== 'backfill').length;
    assert.ok(structuralCount > 0);
    await migration.up(queryInterface, Sequelize);
    assert.equal(operations.filter((item) => item !== 'backfill').length, structuralCount);
    await migration.down(queryInterface, Sequelize);
  });
}
