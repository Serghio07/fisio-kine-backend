const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../../migrations/20260822000100-add-whatsapp-conversation-context');

const Sequelize = { INTEGER: 'INTEGER', DATE: 'DATE', STRING: (size) => `VARCHAR(${size})` };
const buildInterface = ({ incompatible = 0, waiting = 0 } = {}) => {
  const actions = [];
  let select = 0;
  const queryInterface = {
    describeTable: async () => ({ paciente_id: {}, paso_actual: {}, telefono: {} }),
    addColumn: async (...args) => actions.push(['addColumn', ...args]),
    changeColumn: async (...args) => actions.push(['changeColumn', ...args]),
    addIndex: async (...args) => actions.push(['addIndex', ...args]),
    removeIndex: async (...args) => actions.push(['removeIndex', ...args]),
    removeColumn: async (...args) => actions.push(['removeColumn', ...args]),
    sequelize: {
      transaction: async (callback) => callback({ id: 'tx' }),
      query: async (sql) => {
        actions.push(['query', sql]);
        if (/SELECT count/.test(sql)) return [[{ total: select++ === 0 ? incompatible : waiting }]];
        return [[]];
      }
    }
  };
  return { queryInterface, actions };
};

test('migracion de contexto agrega columnas, claves, reglas, backfill e indices', async () => {
  const { queryInterface, actions } = buildInterface();
  await migration.up(queryInterface, Sequelize);
  assert.deepEqual(actions.filter(([name]) => name === 'addColumn').map(([, , column]) => column), [
    'contacto_id', 'paciente_contexto_id', 'contexto_estado', 'contexto_seleccionado_en', 'contexto_origen'
  ]);
  const contact = actions.find(([name, , column]) => name === 'addColumn' && column === 'contacto_id')[3];
  assert.equal(contact.onUpdate, 'CASCADE');
  assert.equal(contact.onDelete, 'SET NULL');
  const sql = actions.filter(([name]) => name === 'query').map(([, value]) => value).join('\n');
  assert.match(sql, /LEGACY_BACKFILL/);
  assert.match(sql, /ESPERANDO_SELECCION_PACIENTE/);
  assert.match(sql, /contexto_estado = 'SELECCIONADO'/);
  assert.match(sql, /paciente_id = paciente_contexto_id/);
  assert.equal(actions.filter(([name]) => name === 'addIndex').length, 2);
});

test('rollback restaura el esquema anterior cuando es representable', async () => {
  const { queryInterface, actions } = buildInterface();
  await migration.down(queryInterface, Sequelize);
  assert.equal(actions.filter(([name]) => name === 'removeColumn').length, 5);
  assert.equal(actions.filter(([name]) => name === 'removeIndex').length, 2);
});

test('rollback bloquea contexto no representable', async () => {
  const { queryInterface } = buildInterface({ incompatible: 1 });
  await assert.rejects(() => migration.down(queryInterface, Sequelize), /Rollback abortado/);
});

test('rollback bloquea conversaciones esperando seleccion', async () => {
  const { queryInterface } = buildInterface({ waiting: 1 });
  await assert.rejects(() => migration.down(queryInterface, Sequelize), /Rollback abortado/);
});
