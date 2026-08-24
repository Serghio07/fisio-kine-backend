const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../../src/models');
const contacts = require('../../src/services/contacto.service');
const relations = require('../../src/services/pacienteContacto.service');

const fakeTransaction = { LOCK: { UPDATE: 'UPDATE' } };
const withMocks = async (mocks, callback) => {
  const originals = [];
  for (const [target, methods] of mocks) for (const [name, value] of Object.entries(methods)) { originals.push([target, name, target[name]]); target[name] = value; }
  try { return await callback(); } finally { for (const [target, name, value] of originals.reverse()) target[name] = value; }
};
const instance = (values) => ({ ...values, get: () => ({ ...values }), update: async function update(changes) { Object.assign(this, changes); return this; } });

test('normaliza el teléfono oficial sin imponer unicidad', () => {
  assert.equal(contacts.normalizePayload({ nombres: 'Juan', apellidos: 'Pérez', telefono: '+591 77712345' }, { create: true }).telefono_normalizado, '59177712345');
});
test('rechaza teléfono inválido', () => assert.throws(() => contacts.validate(contacts.normalizePayload({ nombres: 'Juan', apellidos: 'Pérez', telefono: '123' }, { create: true })), /teléfono/));
test('exige nombres', () => assert.throws(() => contacts.validate(contacts.normalizePayload({ apellidos: 'Pérez', telefono: '77712345' }, { create: true })), /nombres/));
test('exige apellidos', () => assert.throws(() => contacts.validate(contacts.normalizePayload({ nombres: 'Juan', telefono: '77712345' }, { create: true })), /apellidos/));
test('normaliza documento de contacto con la utilidad de pacientes', () => { const value = contacts.normalizePayload({ tipo_documento: 'pasaporte', numero_documento: ' ab-12 ' }); assert.equal(value.tipo_documento, 'PASAPORTE'); assert.equal(value.numero_documento_normalizado, 'AB-12'); });
test('documento puede omitirse completamente', () => assert.deepEqual(contacts.normalizePayload({ nombres: 'Juan' }), { nombres: 'JUAN' }));
test('OTRO exige nombre de documento', () => assert.throws(() => contacts.normalizePayload({ tipo_documento: 'OTRO', numero_documento: 'A1' }), /nombre del documento/));
test('limpiar documento permite dejar todos los campos null', () => { const value = contacts.normalizePayload({ tipo_documento: '', numero_documento: '', nombre_documento_otro: '' }); assert.equal(value.tipo_documento, null); assert.equal(value.numero_documento_normalizado, null); });
test('DTO no expone campos normalizados', () => { const dto = contacts.contactDto({ id: 1, nombres: 'JUAN', apellidos: 'PEREZ', telefono: '77712345', telefono_normalizado: '59177712345', numero_documento_normalizado: '123' }); assert.equal(dto.telefono_normalizado, undefined); assert.equal(dto.numero_documento_normalizado, undefined); });
test('paciente_id debe ser entero positivo', async () => assert.rejects(() => contacts.ensureLinkedPatient('x'), /paciente vinculado/));

test('permite crear dos contactos con el mismo teléfono', async () => {
  const created = [];
  await withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Contacto, { create: async (value) => { created.push(value); return instance({ id: created.length, ...value }); } }], [models.ActividadSistema, { create: async () => ({}) }]], async () => {
    await contacts.create({ body: { nombres: 'Juan', apellidos: 'Pérez', telefono: '77712345' }, userId: 1 });
    await contacts.create({ body: { nombres: 'Ana', apellidos: 'Gómez', telefono: '77712345' }, userId: 1 });
  });
  assert.equal(created.length, 2); assert.equal(created[0].telefono_normalizado, created[1].telefono_normalizado);
});
test('contacto vinculado comprueba paciente existente', async () => withMocks([[models.Paciente, { findByPk: async () => null }]], () => assert.rejects(() => contacts.ensureLinkedPatient(99, null, fakeTransaction), /no encontrado/)));
test('contacto vinculado detecta otro contacto con el mismo paciente', async () => withMocks([[models.Paciente, { findByPk: async () => ({ id: 2 }) }], [models.Contacto, { findOne: async () => ({ id: 3 }) }]], () => assert.rejects(() => contacts.ensureLinkedPatient(2, null, fakeTransaction), /otro contacto/)));

test('valida todos los parentescos aprobados', () => { for (const parentesco of models.PARENTESCOS_CONTACTO) assert.equal(relations.normalize({ parentesco, parentesco_otro: parentesco === 'OTRO' ? 'MADRASTRA' : null, prioridad: 1 }).parentesco, parentesco); });
test('rechaza parentesco no permitido', () => assert.throws(() => relations.normalize({ parentesco: 'AMIGO', prioridad: 1 }), /parentesco/));
test('OTRO exige parentesco_otro', () => assert.throws(() => relations.normalize({ parentesco: 'OTRO', prioridad: 1 }), /especificar/));
test('parentesco normal elimina descripción ajena', () => assert.equal(relations.normalize({ parentesco: 'PADRE', parentesco_otro: 'dato', prioridad: 1 }).parentesco_otro, null));
test('prioridad debe ser entero positivo', () => assert.throws(() => relations.normalize({ parentesco: 'PADRE', prioridad: 0 }), /prioridad/));
test('responsable legal no modifica contacto principal', () => { const value = relations.normalize({ parentesco: 'PADRE', prioridad: 1, es_responsable_legal: true, es_contacto_principal: false }); assert.equal(value.es_responsable_legal, true); assert.equal(value.es_contacto_principal, false); });
test('flags se almacenan como booleanos estrictos', () => { const value = relations.normalize({ parentesco: 'PADRE', prioridad: 1, recibe_recordatorios: true, puede_gestionar_citas: true, autoriza_whatsapp: true }); assert.equal(value.recibe_recordatorios && value.puede_gestionar_citas && value.autoriza_whatsapp, true); });
test('DTO de relación mantiene identificadores y no incluye expediente clínico', () => { const dto = relations.relationDto({ id: 9, paciente_id: 2, contacto_id: 3, paciente: { id: 2, nombres: 'P', apellidos: 'A', historias_clinicas: [{}] }, contacto: { id: 3, nombres: 'C', apellidos: 'A', telefono: '7' } }); assert.equal(dto.relacion_id, 9); assert.equal(dto.paciente.historias_clinicas, undefined); });

test('crear relación rechaza paciente inexistente', async () => withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Paciente, { findByPk: async () => null }], [models.Contacto, { findByPk: async () => instance({ id: 2, estado: true }) }]], () => assert.rejects(() => relations.create({ patientId: 99, contactId: 2, body: { parentesco: 'PADRE' }, userId: 1 }), /Paciente no encontrado/)));
test('crear relación rechaza contacto inactivo', async () => withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Paciente, { findByPk: async () => ({ id: 1 }) }], [models.Contacto, { findByPk: async () => instance({ id: 2, estado: false }) }]], () => assert.rejects(() => relations.create({ patientId: 1, contactId: 2, body: { parentesco: 'PADRE' }, userId: 1 }), /inactivo/)));
test('crear relación rechaza duplicado activo', async () => withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Paciente, { findByPk: async () => ({ id: 1 }) }], [models.Contacto, { findByPk: async () => instance({ id: 2, estado: true }) }], [models.PacienteContacto, { findOne: async () => ({ id: 4 }) }]], () => assert.rejects(() => relations.create({ patientId: 1, contactId: 2, body: { parentesco: 'PADRE' }, userId: 1 }), /relación activa/)));
test('asignar principal desmarca el anterior dentro de la transacción', async () => { let cleared = false; await withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Paciente, { findByPk: async () => ({ id: 1 }) }], [models.Contacto, { findByPk: async () => instance({ id: 2, estado: true }) }], [models.PacienteContacto, { findOne: async () => null, update: async () => { cleared = true; }, create: async (value) => instance({ id: 8, ...value }) }], [models.ActividadSistema, { create: async () => ({}) }]], () => relations.create({ patientId: 1, contactId: 2, body: { parentesco: 'MADRE', es_contacto_principal: true }, userId: 1 })); assert.equal(cleared, true); });
test('cierre es idempotente y no asigna otro principal', async () => { const row = instance({ id: 5, paciente_id: 1, contacto_id: 2, estado: false, fecha_fin: '2026-01-01', es_contacto_principal: false }); let updated = false; row.update = async () => { updated = true; }; await withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.PacienteContacto, { findOne: async () => row }]], () => relations.close({ patientId: 1, relationId: 5, userId: 1 })); assert.equal(updated, false); });
test('desactivar contacto con relaciones activas responde conflicto', async () => { const row = instance({ id: 5, estado: true }); await withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Contacto, { findByPk: async () => row }], [models.PacienteContacto, { count: async () => 1 }]], () => assert.rejects(() => contacts.deactivate({ id: 5, userId: 1 }), (error) => error.status === 409)); });
test('desactivar contacto sin relaciones conserva historial y cambia estado', async () => { const row = instance({ id: 5, estado: true }); await withMocks([[models.sequelize, { transaction: async (fn) => fn(fakeTransaction) }], [models.Contacto, { findByPk: async () => row }], [models.PacienteContacto, { count: async () => 0 }], [models.ActividadSistema, { create: async () => ({}) }]], () => contacts.deactivate({ id: 5, userId: 1 })); assert.equal(row.estado, false); });
