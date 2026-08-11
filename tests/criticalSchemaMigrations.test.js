const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migrationNames = [
  '20260811000400-add-registro-semanal-historia-foreign-key.js',
  '20260811000500-correct-citas-foreign-key-delete-rules.js',
  '20260811000600-enforce-confirmed-high-risk-nullability.js'
];

for (const migrationName of migrationNames) {
  test(`${migrationName} conserva las salvaguardas obligatorias`, () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../migrations', migrationName), 'utf8');
    assert.match(source, /sequelize\.transaction/);
    assert.match(source, /Migracion abortada/);
    assert.match(source, /SELECT[\s\S]+count/i);
    assert.doesNotMatch(source, /\.sync\s*\(/);
    assert.doesNotMatch(source, /DROP\s+TABLE/i);
    assert.doesNotMatch(source, /TRUNCATE/i);
    assert.doesNotMatch(source, /DELETE\s+FROM/i);
    assert.equal(typeof require(path.resolve(__dirname, '../migrations', migrationName)).up, 'function');
  });
}

test('asociaciones de citas preservan citas al eliminar entidades relacionadas', () => {
  const { Cita } = require('../src/models');
  assert.equal(Cita.rawAttributes.paciente_id.onDelete, 'RESTRICT');
  assert.equal(Cita.rawAttributes.historia_clinica_id.onDelete, 'RESTRICT');
  assert.equal(Cita.rawAttributes.profesional_id.onDelete, 'SET NULL');
  assert.equal(Cita.rawAttributes.sesion_id.onDelete, 'RESTRICT');
});
