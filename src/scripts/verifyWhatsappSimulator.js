const path = require('path');

const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
if (!envFile) {
  console.error('Debes indicar --env=.env.whatsapp-test');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

const { validateSimulatorSafety } = require('../config/whatsapp');
const safety = validateSimulatorSafety();
if (!safety.ready) {
  console.error('Prueba cancelada:', safety.errors.join(', '));
  process.exit(1);
}

const jwt = require('jsonwebtoken');
const app = require('../app');
const {
  sequelize,
  Paciente,
  Cita,
  HistoriaClinica,
  Sesion,
  PagoClinico,
  Usuario,
  ConversacionWhatsapp,
  MensajeWhatsapp,
  AuditoriaWhatsapp
} = require('../models');
const {
  STEPS,
  startConversation,
  processConversationMessage,
  resetConversation
} = require('../services/whatsappConversation.service');

const ensure = (condition, message) => {
  if (!condition) throw new Error(message);
};

const send = (conversation, phone, content, suffix) => processConversationMessage({
  messageId: `sim-test-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  telefono: phone,
  contenido: content,
  tipo: 'text',
  origen: 'WHATSAPP',
  fecha: new Date(),
  conversacionId: conversation.conversacionId
});

const counts = async () => ({
  pacientes: await Paciente.count(),
  citas: await Cita.count(),
  historias: await HistoriaClinica.count(),
  sesiones: await Sesion.count(),
  pagos: await PagoClinico.count()
});

const run = async () => {
  const createdPatients = [];
  let createdUser;
  let server;
  try {
    await sequelize.authenticate();
    const before = await counts();
    const suffix = String(Date.now()).slice(-7);
    const uniquePhone = `59171${suffix}`;
    const multiplePhone = `59172${suffix}`;
    const noPatientPhone = `59173${suffix}`;
    const otherPhone = `59174${suffix}`;

    createdPatients.push(await Paciente.create({
      nombres: 'SIMULADOR',
      apellidos: 'UNICO',
      ci: `81${suffix}`,
      sexo: 'MASCULINO',
      telefono: uniquePhone.slice(3),
      telefono_normalizado: uniquePhone,
      estado: true
    }));
    createdPatients.push(await Paciente.create({
      nombres: 'PRIMERO',
      apellidos: 'PRUEBA',
      ci: `82${suffix}`,
      sexo: 'MASCULINO',
      telefono: multiplePhone.slice(3),
      telefono_normalizado: multiplePhone,
      estado: true
    }));
    createdPatients.push(await Paciente.create({
      nombres: 'SEGUNDO',
      apellidos: 'PRUEBA',
      ci: `83${suffix}`,
      sexo: 'FEMENINO',
      telefono: multiplePhone.slice(3),
      telefono_normalizado: multiplePhone,
      estado: true
    }));

    const direct = await startConversation({ telefono: uniquePhone, origen: 'WHATSAPP' });
    ensure(direct.pasoNuevo === STEPS.PERSON_SELECTION, 'Inicio WHATSAPP invalido');
    const forMe = await send(direct, uniquePhone, 'BOOK_FOR_ME', 'for-me');
    ensure(forMe.pasoNuevo === STEPS.IDENTITY_VERIFICATION, 'No solicito verificacion');
    ensure(!JSON.stringify(forMe).includes(createdPatients[0].ci), 'El CI fue expuesto');
    ensure(forMe.texto.includes('SIMULADOR U.'), 'Nombre protegido incorrecto');
    const invalidSuffix = await send(forMe, uniquePhone, '12', 'invalid-suffix');
    ensure(invalidSuffix.pasoNuevo === STEPS.IDENTITY_VERIFICATION, 'Formato invalido cambio el paso');
    const verified = await send(forMe, uniquePhone, createdPatients[0].ci.slice(-4), 'verified');
    ensure(verified.pasoNuevo === STEPS.READY_FOR_CARE_TYPE, 'Identidad no verificada');

    const web = await startConversation({ telefono: noPatientPhone, origen: 'WEB_WHATSAPP' });
    const notFound = await send(web, noPatientPhone, 'BOOK_FOR_ME', 'not-found');
    ensure(notFound.pasoNuevo === STEPS.PATIENT_NOT_FOUND, 'Paciente inexistente no detectado');

    const multiple = await startConversation({ telefono: multiplePhone, origen: 'WHATSAPP' });
    const selection = await send(multiple, multiplePhone, 'BOOK_FOR_ME', 'multiple');
    ensure(selection.pasoNuevo === STEPS.PATIENT_SELECTION && selection.opciones.length === 2, 'Multiples pacientes no manejados');
    ensure(selection.opciones.every((option) => /^[A-ZÁÉÍÓÚÜÑ]+ [A-ZÁÉÍÓÚÜÑ]\.$/iu.test(option.label)), 'Nombre de paciente no protegido');
    const selected = await send(selection, multiplePhone, selection.opciones[0].id, 'selected');
    ensure(selected.pasoNuevo === STEPS.IDENTITY_VERIFICATION, 'Seleccion de paciente invalida');

    const other = await startConversation({ telefono: otherPhone, origen: 'WHATSAPP' });
    let otherStep = await send(other, otherPhone, 'BOOK_FOR_OTHER', 'other');
    ensure(otherStep.pasoNuevo === STEPS.OTHER_NAME, 'No inicio captura de otra persona');
    otherStep = await send(otherStep, otherPhone, 'ANA', 'other-name');
    ensure(otherStep.pasoNuevo === STEPS.OTHER_LAST_NAMES, 'No capturo nombre');
    otherStep = await send(otherStep, otherPhone, 'PEREZ LOPEZ', 'other-lastnames');
    ensure(otherStep.pasoNuevo === STEPS.OTHER_CI, 'No capturo apellidos');
    const otherCi = `94${suffix}`;
    otherStep = await send(otherStep, otherPhone, otherCi, 'other-ci');
    ensure(otherStep.pasoNuevo === STEPS.OTHER_BIRTH_DATE, 'No capturo CI');
    ensure(!JSON.stringify(otherStep.datosTemporales).includes(otherCi), 'CI temporal expuesto');
    otherStep = await send(otherStep, otherPhone, '1990-05-10', 'other-birth');
    ensure(otherStep.pasoNuevo === STEPS.OTHER_RELATION, 'No capturo fecha');
    otherStep = await send(otherStep, otherPhone, 'MADRE', 'other-relation');
    ensure(otherStep.pasoNuevo === STEPS.READY_FOR_CARE_TYPE, 'Captura progresiva incompleta');

    const invalid = await send(otherStep, otherPhone, 'SALTAR', 'invalid-step');
    ensure(invalid.error === 'INVALID_TRANSITION', 'Paso arbitrario permitido');
    const duplicateId = `sim-duplicate-${Date.now()}`;
    const duplicatePayload = {
      messageId: duplicateId,
      telefono: noPatientPhone,
      contenido: 'BOOK_FOR_OTHER',
      tipo: 'text',
      origen: 'WEB_WHATSAPP',
      conversacionId: web.conversacionId
    };
    await processConversationMessage(duplicatePayload);
    const duplicate = await processConversationMessage(duplicatePayload);
    ensure(duplicate.duplicado, 'Duplicado no ignorado');
    ensure(await AuditoriaWhatsapp.count({ where: { message_id_externo: duplicateId, accion: 'MENSAJE_DUPLICADO' } }), 'Duplicado no auditado');

    const oldConversationId = multiple.conversacionId;
    const reset = await resetConversation({
      conversacionId: oldConversationId,
      telefono: multiplePhone,
      origen: 'WHATSAPP'
    });
    ensure(reset.conversacionId !== oldConversationId, 'Reinicio no creo una conversacion nueva');
    const oldConversation = await ConversacionWhatsapp.findByPk(oldConversationId);
    ensure(oldConversation.estado === 'FINALIZADA', 'Conversacion anterior no finalizada');
    ensure(await MensajeWhatsapp.count({ where: { conversacion_id: oldConversationId } }) > 0, 'Reinicio elimino el historial');

    const admin = await Usuario.findOne({ where: { rol: 'admin', estado: 'activo', activo: true } });
    ensure(admin && process.env.JWT_SECRET, 'Falta administrador o JWT_SECRET de prueba');
    createdUser = await Usuario.create({
      nombre: 'USUARIO SIMULADOR TEMPORAL',
      usuario: `sim_personal_${suffix}`,
      email: `sim_${suffix}@example.test`,
      password: `Temporal-${suffix}-Aa1!`,
      rol: 'personal',
      estado: 'activo',
      activo: true
    });
    const adminToken = jwt.sign({ id: admin.id, rol: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    const personalToken = jwt.sign({ id: createdUser.id, rol: 'personal' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}/api/whatsapp/simulator/start`;
    const apiPayload = { telefono: `59175${suffix}`, origen: 'WHATSAPP' };
    const unauthorized = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(apiPayload)
    });
    ensure(unauthorized.status === 401, 'Endpoint sin autenticacion no fue rechazado');
    const forbidden = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${personalToken}` },
      body: JSON.stringify(apiPayload)
    });
    ensure(forbidden.status === 403, 'Rol no administrador no fue rechazado');
    const authorized = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
      body: JSON.stringify(apiPayload)
    });
    ensure(authorized.status === 201, 'Administrador no pudo iniciar simulacion');
    const authorizedData = await authorized.json();
    const apiConversationId = authorizedData.conversation.id;
    const authHeaders = { authorization: `Bearer ${adminToken}` };
    for (const route of [
      `/api/whatsapp/simulator/conversations/${apiConversationId}`,
      `/api/whatsapp/simulator/conversations/${apiConversationId}/messages`,
      `/api/whatsapp/simulator/conversations/${apiConversationId}/audit`
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { headers: authHeaders });
      ensure(response.status === 200, `Endpoint ${route} no respondio correctamente`);
    }
    const apiMessage = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/simulator/message`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        messageId: `sim-api-${suffix}`,
        telefono: apiPayload.telefono,
        contenido: 'BOOK_FOR_OTHER',
        origen: 'WHATSAPP',
        conversacionId: apiConversationId
      })
    });
    ensure(apiMessage.status === 200, 'Endpoint de mensaje no respondio correctamente');
    const apiReset = await fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/simulator/reset`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        telefono: apiPayload.telefono,
        origen: 'WHATSAPP',
        conversacionId: apiConversationId
      })
    });
    ensure(apiReset.status === 200, 'Endpoint de reinicio no respondio correctamente');

    for (const patient of createdPatients) await patient.destroy();
    createdPatients.length = 0;
    await createdUser.destroy();
    createdUser = null;
    const after = await counts();
    ensure(JSON.stringify(before) === JSON.stringify(after), 'Los modulos clinicos cambiaron durante la prueba');

    console.log(JSON.stringify({
      database: process.env.DB_NAME,
      provider: process.env.WHATSAPP_PROVIDER,
      checks: {
        inicioWhatsapp: true,
        inicioWebWhatsapp: true,
        paraMi: true,
        paraOtraPersona: true,
        pacienteEncontrado: true,
        pacienteNoEncontrado: true,
        pacientesMultiples: true,
        nombreProtegido: true,
        ciProtegido: true,
        transicionInvalida: true,
        duplicadoIgnorado: true,
        reinicioConHistorial: true,
        auditoria: true,
        autenticacion: true,
        rolAdministrador: true,
        seisEndpointsAdministrativos: true,
        modulosClinicosSinCambios: true
      },
      countsBefore: before,
      countsAfter: after
    }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (createdUser) await createdUser.destroy().catch(() => {});
    for (const patient of createdPatients) await patient.destroy().catch(() => {});
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error('Verificacion del simulador fallida:', error.message);
  process.exitCode = 1;
});
