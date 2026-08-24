const test = require('node:test');
const assert = require('node:assert/strict');
const { PacienteContacto } = require('../../src/models');
const { isMinorByBirthDate, resolveAdministrativePhone, resolveReminderRecipient, patientDtosWithAdministrativePhone, enrichRecordsWithAdministrativePhone } = require('../../src/services/patientAdministrativeContact.service');
const { validarPaciente, validarTelefonoUnico } = require('../../src/controllers/paciente.controller');

test('calcula minoría usando día, mes y año', () => {
  assert.equal(isMinorByBirthDate('2008-08-20', '2026-08-19'), true);
  assert.equal(isMinorByBirthDate('2008-08-19', '2026-08-19'), false);
});

test('adulto resuelve su teléfono personal', async () => {
  const result = await resolveAdministrativePhone({ id: 1, fecha_nacimiento: '1990-01-01', telefono: '77712345' });
  assert.equal(result.fuente, 'PACIENTE');
  assert.equal(result.telefono_normalizado, '59177712345');
  assert.equal(result.contacto_id, null);
});

test('menor resuelve únicamente el contacto principal activo', async () => {
  const original = PacienteContacto.findOne;
  let query;
  PacienteContacto.findOne = async (options) => {
    query = options;
    return { parentesco: 'PADRE', parentesco_otro: null, es_responsable_legal: true, es_contacto_principal: true, contacto: { id: 9, nombres: 'JUAN', apellidos: 'PEREZ', telefono: '77712345', paciente_id: 20 } };
  };
  try {
    const result = await resolveAdministrativePhone({ id: 35, fecha_nacimiento: '2016-01-01', telefono: null });
    assert.equal(result.fuente, 'CONTACTO');
    assert.equal(result.telefono_normalizado, '59177712345');
    assert.equal(result.responsable_principal.paciente_id, 20);
    assert.deepEqual(query.where, { paciente_id: 35, estado: true, fecha_fin: null, es_contacto_principal: true });
    assert.equal(query.include[0].where.estado, true);
  } finally { PacienteContacto.findOne = original; }
});

test('menor sin principal válido no tiene teléfono administrativo', async () => {
  const original = PacienteContacto.findOne;
  PacienteContacto.findOne = async () => null;
  try { assert.equal(await resolveAdministrativePhone({ id: 2, fecha_nacimiento: '2016-01-01', telefono: null }), null); }
  finally { PacienteContacto.findOne = original; }
});

test('menor conserva teléfono personal y resuelve el administrativo desde tutor', async () => {
  const original = PacienteContacto.findOne;
  PacienteContacto.findOne = async () => ({
    parentesco: 'MADRE',
    es_contacto_principal: true,
    contacto: { id: 10, nombres: 'MARIA', apellidos: 'PEREZ', telefono: '77712345', estado: true }
  });
  try {
    const patient = { id: 35, fecha_nacimiento: '2016-01-01', telefono: '76543210' };
    const administrative = await resolveAdministrativePhone(patient);
    assert.equal(patient.telefono, '76543210');
    assert.equal(administrative.telefono, '77712345');
    assert.equal(administrative.fuente, 'CONTACTO');
  } finally { PacienteContacto.findOne = original; }
});

test('adulto exige teléfono y todo menor exige responsable principal', () => {
  const base = { nombres: 'ANA', apellidos: 'PEREZ', tipo_documento: 'CI', numero_documento: '123', sexo: 'FEMENINO' };
  assert.equal(validarPaciente({ ...base, fecha_nacimiento: '1990-01-01', telefono: null }), 'El teléfono es obligatorio para pacientes adultos.');
  assert.equal(validarPaciente({ ...base, fecha_nacimiento: '2016-01-01', telefono: null }), 'Debe seleccionar un responsable principal para el paciente menor.');
  assert.equal(validarPaciente({ ...base, fecha_nacimiento: '2016-01-01', telefono: '76543210' }), 'Debe seleccionar un responsable principal para el paciente menor.');
  assert.equal(validarPaciente({ ...base, fecha_nacimiento: '2016-01-01', telefono: null }, { hasAdministrativeContact: true }), null);
  assert.equal(validarPaciente({ ...base, fecha_nacimiento: '2016-01-01', telefono: '76543210' }, { hasAdministrativeContact: true }), null);
});

test('unicidad no consulta la base para teléfono null', async () => {
  assert.equal(await validarTelefonoUnico(null), true);
});

test('normalización conserva null real para menor sin teléfono', () => {
  const { normalizarPaciente } = require('../../src/controllers/paciente.controller');
  const result = normalizarPaciente({ telefono: null });
  assert.equal(result.telefono, null);
  assert.equal(result.telefono_normalizado, null);
});

test('enriquece listados en lote y permite hermanos con el mismo responsable', async () => {
  const original = PacienteContacto.findAll;
  let calls = 0;
  PacienteContacto.findAll = async (options) => {
    calls += 1;
    assert.equal(options.where.estado, true);
    assert.equal(options.where.fecha_fin, null);
    assert.equal(options.include[0].where.estado, true);
    return [
      { paciente_id: 35, parentesco: 'PADRE', parentesco_otro: null, contacto: { id: 9, nombres: 'JUAN', apellidos: 'PEREZ', telefono: '77712345', paciente_id: 20 } },
      { paciente_id: 36, parentesco: 'PADRE', parentesco_otro: null, contacto: { id: 9, nombres: 'JUAN', apellidos: 'PEREZ', telefono: '77712345', paciente_id: 20 } }
    ];
  };
  try {
    const result = await patientDtosWithAdministrativePhone([
      { id: 20, fecha_nacimiento: '1990-01-01', telefono: '77712345' },
      { id: 35, fecha_nacimiento: '2016-01-01', telefono: null },
      { id: 36, fecha_nacimiento: '2018-01-01', telefono: null }
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(result.map((item) => item.telefono_administrativo), ['77712345', '77712345', '77712345']);
    assert.equal(result[1].responsable_principal.paciente_id, 20);
    assert.equal(result[2].responsable_principal.id, 9);
  } finally { PacienteContacto.findAll = original; }
});

test('enriquece asociaciones sin alterar telefono personal', async () => {
  const original = PacienteContacto.findAll;
  PacienteContacto.findAll = async () => [{ paciente_id: 2, parentesco: 'MADRE', contacto: { id: 7, nombres: 'ANA', apellidos: 'PEREZ', telefono: '62295637' } }];
  try {
    const [record] = await enrichRecordsWithAdministrativePhone([{ id: 8, paciente: { id: 2, fecha_nacimiento: '2016-01-01', telefono: null } }]);
    assert.equal(record.paciente.telefono, null);
    assert.equal(record.paciente.telefono_administrativo, '62295637');
    assert.equal(record.paciente.responsable_principal.parentesco, 'MADRE');
  } finally { PacienteContacto.findAll = original; }
});

test('recordatorio usa paciente adulto y tutor autorizado para menor', async () => {
  const adult = await resolveReminderRecipient({ id: 20, nombres: 'Juan', apellidos: 'Perez', fecha_nacimiento: '1990-01-01', telefono: '77712345' });
  assert.deepEqual({ source: adult.source, contactId: adult.contactId, patientId: adult.patientId }, { source: 'PACIENTE', contactId: null, patientId: 20 });
  const relationModel = { findOne: async () => ({ parentesco: 'PADRE', recibe_recordatorios: true, autoriza_whatsapp: true, contacto: { id: 9, nombres: 'Juan', apellidos: 'Perez', telefono: '77712345', estado: true } }) };
  const minor = await resolveReminderRecipient({ id: 35, fecha_nacimiento: '2016-01-01' }, { relationModel, contactModel: {} });
  assert.deepEqual({ source: minor.source, contactId: minor.contactId, patientId: minor.patientId, relationship: minor.relationship }, { source: 'CONTACTO', contactId: 9, patientId: 35, relationship: 'PADRE' });
});

test('recordatorio de menor exige permisos y contacto valido', async () => {
  const patient = { id: 35, fecha_nacimiento: '2016-01-01' };
  const resolveWith = (relation) => resolveReminderRecipient(patient, { relationModel: { findOne: async () => relation }, contactModel: {} });
  assert.equal((await resolveWith(null)).reason, 'SIN_CONTACTO_PRINCIPAL');
  assert.equal((await resolveWith({ recibe_recordatorios: false })).reason, 'RECORDATORIOS_NO_AUTORIZADOS');
  assert.equal((await resolveWith({ recibe_recordatorios: true, autoriza_whatsapp: false })).reason, 'WHATSAPP_NO_AUTORIZADO');
  assert.equal((await resolveWith({ recibe_recordatorios: true, autoriza_whatsapp: true, contacto: { estado: false } })).reason, 'CONTACTO_INACTIVO');
  assert.equal((await resolveWith({ recibe_recordatorios: true, autoriza_whatsapp: true, contacto: { estado: true, telefono: 'x' } })).reason, 'TELEFONO_CONTACTO_INVALIDO');
});
