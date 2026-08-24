const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../../migrations/20260821000100-add-reminder-recipient-traceability');
const { WhatsappAppointmentReminder } = require('../../src/models');

const Sequelize = { INTEGER: 'INTEGER', STRING: (size) => `VARCHAR(${size})` };
const buildInterface = (rollbackTotal = 0) => {
  const actions = [];
  const queryInterface = {
    describeTable: async () => ({ telefono_normalizado: {}, estado: {} }),
    addColumn: async (...args) => actions.push(['addColumn', ...args]),
    changeColumn: async (...args) => actions.push(['changeColumn', ...args]),
    addIndex: async (...args) => actions.push(['addIndex', ...args]),
    removeIndex: async (...args) => actions.push(['removeIndex', ...args]),
    removeColumn: async (...args) => actions.push(['removeColumn', ...args]),
    sequelize: {
      transaction: async (callback) => callback({ id: 'tx' }),
      query: async (sql) => { actions.push(['query', sql]); return /SELECT count/.test(sql) ? [[{ total: rollbackTotal }]] : [[]]; }
    }
  };
  return { queryInterface, actions };
};

test('up agrega trazabilidad, backfill, restricciones e indice', async () => {
  const { queryInterface, actions } = buildInterface();
  await migration.up(queryInterface, Sequelize);
  assert.deepEqual(actions.filter(([action]) => action === 'addColumn').map(([, , name]) => name), ['contacto_id', 'telefono_fuente', 'parentesco_snapshot', 'destinatario_nombre_snapshot']);
  const sql = actions.filter(([action]) => action === 'query').map(([, value]) => value).join('\n');
  assert.match(sql, /SET telefono_fuente = 'PACIENTE'/);
  assert.match(sql, /SIN_DESTINATARIO/);
  assert.match(sql, /telefono_fuente IN \('PACIENTE', 'CONTACTO'\)/);
  assert.match(sql, /estado <> 'SIN_DESTINATARIO' AND telefono_normalizado IS NOT NULL/);
  assert.doesNotMatch(sql, /SET\s+(cita_id|paciente_id|telefono_normalizado|estado)\s*=/i);
  const contact = actions.find(([action, , name]) => action === 'addColumn' && name === 'contacto_id')[3];
  assert.equal(contact.onDelete, 'SET NULL');
});

test('down restaura esquema si no hay filas incompatibles', async () => {
  const { queryInterface, actions } = buildInterface(0);
  await migration.down(queryInterface, Sequelize);
  assert.equal(actions.filter(([action]) => action === 'removeColumn').length, 4);
  assert.ok(actions.some(([action, , name]) => action === 'changeColumn' && name === 'telefono_normalizado'));
});

test('down se bloquea si perderia recordatorios sin destinatario', async () => {
  const { queryInterface } = buildInterface(2);
  await assert.rejects(() => migration.down(queryInterface, Sequelize), /Rollback abortado/);
});

test('modelo exige teléfono solo para estados enviables', async () => {
  const base = { cita_id: 1, paciente_id: 2, telefono_fuente: 'PACIENTE', programado_para: new Date(), cita_fecha: '2026-08-22', cita_hora_inicio: '10:00:00', cita_estado: 'Programada', idempotency_key: 'test-destination-state' };
  await assert.doesNotReject(() => WhatsappAppointmentReminder.build({ ...base, estado: 'SIN_DESTINATARIO', telefono_normalizado: null }).validate());
  await assert.rejects(() => WhatsappAppointmentReminder.build({ ...base, estado: 'PENDIENTE', telefono_normalizado: null }).validate(), /requiere teléfono/);
  await assert.rejects(() => WhatsappAppointmentReminder.build({ ...base, estado: 'SIN_DESTINATARIO', telefono_normalizado: '59160000000' }).validate(), /no puede tener teléfono/);
});
