const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../../migrations/20260819000200-allow-null-personal-phone-for-minors');

test('up solo elimina NOT NULL de las dos columnas', async () => {
  const statements = [];
  const queryInterface = {
    quoteIdentifier: (value) => `"${value}"`,
    describeTable: async () => ({ telefono: {}, telefono_normalizado: {} }),
    sequelize: { transaction: async (callback) => callback({}), query: async (sql) => { statements.push(sql); return [[]]; } }
  };
  await migration.up(queryInterface);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /telefono" DROP NOT NULL/);
  assert.match(statements[1], /telefono_normalizado" DROP NOT NULL/);
  assert.doesNotMatch(statements.join(' '), /UPDATE|DELETE|DROP INDEX/i);
});

test('down restaura NOT NULL si no existen pacientes incompatibles', async () => {
  const statements = [];
  const queryInterface = { sequelize: { transaction: async (callback) => callback({}), query: async (sql) => { statements.push(sql); return statements.length === 1 ? [[{ total: 0 }]] : [[]]; } } };
  await migration.down(queryInterface);
  assert.match(statements[1], /telefono SET NOT NULL/);
  assert.match(statements[1], /telefono_normalizado SET NOT NULL/);
});

test('down se detiene si existen teléfonos null', async () => {
  const queryInterface = { sequelize: { transaction: async (callback) => callback({}), query: async () => [[{ total: 2 }]] } };
  await assert.rejects(() => migration.down(queryInterface), /Rollback abortado/);
});
