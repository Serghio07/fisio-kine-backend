const test = require('node:test');
const assert = require('node:assert/strict');
const { findAdministrativePatientIdsByPhone } = require('../../src/controllers/paciente.controller');

test('búsqueda administrativa devuelve varios pacientes y deduplica por id', async () => {
  let query;
  const ids = await findAdministrativePatientIdsByPhone('77712345', {
    contactModel: {},
    relationModel: {
      findAll: async (options) => {
        query = options;
        return [{ paciente_id: 35 }, { paciente_id: 36 }, { paciente_id: 35 }];
      }
    }
  });
  assert.deepEqual(ids, [35, 36]);
  assert.deepEqual(query.where, { estado: true, fecha_fin: null, es_contacto_principal: true });
  assert.equal(query.include[0].where.estado, true);
  assert.equal(query.raw, true);
});

test('búsqueda administrativa ignora texto que no es teléfono', async () => {
  let called = false;
  const ids = await findAdministrativePatientIdsByPhone('JUAN', {
    relationModel: { findAll: async () => { called = true; return []; } }
  });
  assert.deepEqual(ids, []);
  assert.equal(called, false);
});
