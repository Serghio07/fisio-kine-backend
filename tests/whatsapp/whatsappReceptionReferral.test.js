const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeKeyFor, minimalContext, createOrReuseReceptionReferral } = require('../../src/services/whatsappReceptionReferral.service');
const { maskPhone, dto, mutate } = require('../../src/services/receptionReferralManagement.service');

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const conversation = { id: 4, telefono: '591 60000000', paciente_id: 8 };
const entity = (values) => ({ async update(data) { Object.assign(this, data); return this; }, ...values });

test('crea derivacion minima vinculada sin datos clinicos', async () => {
  let inserted;
  const result = await createOrReuseReceptionReferral({ conversation, type: 'REGISTRO_PACIENTE', requestId: 9, transaction, now: new Date('2026-08-04T14:00:00Z'), context: { requested_date: '2026-08-08', requested_start: '09:00', motivo: 'dato clínico' }, referralModel: { findOne: async () => null, create: async (data) => { inserted = data; return entity({ id: 1, ...data }); } } });
  assert.equal(result.created, true); assert.equal(inserted.telefono_normalizado, '59160000000'); assert.equal(inserted.paciente_id, 8); assert.equal(inserted.solicitud_cita_id, 9); assert.equal(inserted.prioridad, 'NORMAL');
  const serialized = JSON.stringify(inserted); assert.equal(serialized.includes('dato clínico'), false); assert.equal(serialized.includes('motivo'), false);
});

test('reutiliza activa y permite clave estable por referencia', async () => {
  const active = entity({ id: 2, estado: 'PENDIENTE' }); let creates = 0;
  const result = await createOrReuseReceptionReferral({ conversation, type: 'RECORDATORIO_CITA', reminderId: 11, appointmentId: 21, transaction, referralModel: { findOne: async () => active, create: async () => { creates += 1; } } });
  assert.equal(result.created, false); assert.equal(result.referral, active); assert.equal(creates, 0);
  assert.equal(scopeKeyFor({ type: 'RECORDATORIO_CITA', reminderId: 11 }), 'whatsapp-referral:RECORDATORIO_CITA:reminder:11');
});

test('contexto permitido y DTO ocultan telefono y referencias tecnicas', () => {
  assert.deepEqual(minimalContext({ technical_reason: 'INVALID_DURATION', requested_date: '2026-08-08', diagnosis: 'privado' }), { technical_reason: 'INVALID_DURATION', requested_date: '2026-08-08' });
  assert.equal(maskPhone('591600005637'), '591******637');
  const output = dto({ id: 1, tipo_derivacion: 'CONSULTA_GENERAL', estado: 'PENDIENTE', prioridad: 'NORMAL', telefono_normalizado: '591600005637', paciente: null, responsable: null, cita: null, historial: [], created_at: new Date(), updated_at: new Date() }, true);
  assert.equal(output.telefono, '591******637'); assert.equal(Object.hasOwn(output, 'scope_key'), false); assert.equal(Object.hasOwn(output, 'contexto_minimo'), false);
});

test('detalle de registro pendiente muestra nombre motivo fecha y horario de la solicitud vinculada', () => {
  const output = dto({
    id: 2, tipo_derivacion: 'REGISTRO_PACIENTE', estado: 'EN_ATENCION', prioridad: 'NORMAL',
    telefono_normalizado: '591600005637', paciente: null, responsable: { nombre: 'Recepción' }, cita: null,
    solicitud: { nombre_whatsapp: 'Cookie Pérez', motivo: 'Dolor de rodilla', fecha_solicitada: '2026-08-08', hora_inicio: '10:00:00', hora_fin: '11:30:00', estado: 'DERIVADA_PERSONAL' },
    historial: [], created_at: new Date(), updated_at: new Date()
  }, true);
  assert.equal(output.contacto, 'Cookie Pérez');
  assert.deepEqual(output.solicitud, { nombre: 'Cookie Pérez', motivo: 'Dolor de rodilla', fecha: '2026-08-08', hora_inicio: '10:00', hora_fin: '11:30', estado: 'DERIVADA_PERSONAL' });
});

test('tomar usa lock, asigna solo una vez y registra auditoria', async () => {
  const item = entity({ id: 5, paciente_id: null, estado: 'PENDIENTE', historial: [], responsable_usuario_id: null }); let audits = 0;
  const db = { transaction: async (callback) => callback(transaction) };
  const model = { findByPk: async (id, options) => { assert.equal(options.lock, 'UPDATE'); return item; } };
  const models = require('../../src/models'); const original = models.ActividadSistema.create; models.ActividadSistema.create = async () => { audits += 1; };
  try { await mutate({ id: 5, user: { id: 7, rol: 'personal' }, action: 'TOMADA', db, model, now: new Date('2026-08-04T14:00:00Z') }); } finally { models.ActividadSistema.create = original; }
  assert.equal(item.estado, 'EN_ATENCION'); assert.equal(item.responsable_usuario_id, 7); assert.ok(item.tomada_en); assert.equal(audits, 1);
  await assert.rejects(() => mutate({ id: 5, user: { id: 8, rol: 'personal' }, action: 'TOMADA', db, model }), (error) => error.status === 409);
});

test('resolver y cerrar exigen responsable y estados compatibles', async () => {
  const item = entity({ id: 5, paciente_id: null, estado: 'EN_ATENCION', historial: [], responsable_usuario_id: 7 });
  const db = { transaction: async (callback) => callback(transaction) }; const model = { findByPk: async () => item };
  const models = require('../../src/models'); const original = models.ActividadSistema.create; models.ActividadSistema.create = async () => {};
  try {
    await assert.rejects(() => mutate({ id: 5, user: { id: 8, rol: 'personal' }, action: 'RESUELTA', value: 'Hecho', db, model }), (error) => error.status === 403);
    await mutate({ id: 5, user: { id: 7, rol: 'personal' }, action: 'RESUELTA', value: 'Registro revisado', db, model }); assert.equal(item.estado, 'RESUELTA');
    await mutate({ id: 5, user: { id: 7, rol: 'personal' }, action: 'CERRADA', db, model }); assert.equal(item.estado, 'CERRADA');
  } finally { models.ActividadSistema.create = original; }
});
