const path = require('path');

const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
if (!envFile) {
  console.error('Debes indicar --env=.env.whatsapp-test');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
if (process.env.WHATSAPP_TEST_DATABASE !== 'true' || !/test/i.test(process.env.DB_NAME || '')) {
  console.error('Prueba cancelada: el entorno no corresponde a una base de prueba.');
  process.exit(1);
}

process.env.WHATSAPP_TEST_MODE = 'true';
process.env.WHATSAPP_TEST_NUMBERS = '59170000001';

const {
  sequelize,
  Cita,
  Paciente,
  ConversacionWhatsapp,
  MensajeWhatsapp,
  AuditoriaWhatsapp
} = require('../models');
const { processWebhookEvent } = require('../services/whatsappWebhook.service');

const run = async () => {
  try {
    await sequelize.authenticate();
    const before = {
      pacientes: await Paciente.count(),
      citas: await Cita.count()
    };
    const suffix = Date.now();
    const incomingId = `wamid.TEST-IN-${suffix}`;
    const outgoingId = `wamid.TEST-OUT-${suffix}`;
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          field: 'messages',
          value: {
            messages: [{
              id: incomingId,
              from: '59170000001',
              timestamp: String(Math.floor(Date.now() / 1000)),
              type: 'text',
              text: { body: 'Hola, quiero agendar una cita. REF:WEB-PHYSIO' }
            }]
          }
        }]
      }]
    };
    const sendTextMessage = async () => ({
      summary: { success: true, messageId: outgoingId, contact: '59170000001' },
      attempts: 1
    });

    const first = await processWebhookEvent(payload, { sendTextMessage });
    const duplicate = await processWebhookEvent(payload, { sendTextMessage });
    for (const status of ['sent', 'delivered', 'read']) {
      await processWebhookEvent({
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            field: 'messages',
            value: {
              statuses: [{
                id: outgoingId,
                status,
                timestamp: String(Math.floor(Date.now() / 1000))
              }]
            }
          }]
        }]
      });
    }

    const conversation = await ConversacionWhatsapp.findByPk(first.results[0].conversationId);
    const incoming = await MensajeWhatsapp.findOne({ where: { message_id_externo: incomingId } });
    const outgoing = await MensajeWhatsapp.findOne({ where: { message_id_externo: outgoingId } });
    const unauthorizedId = `wamid.TEST-UNAUTHORIZED-${suffix}`;
    const unauthorizedPhone = '59170000999';
    const unauthorizedPayload = JSON.parse(JSON.stringify(payload));
    unauthorizedPayload.entry[0].changes[0].value.messages[0].id = unauthorizedId;
    unauthorizedPayload.entry[0].changes[0].value.messages[0].from = unauthorizedPhone;
    await processWebhookEvent(unauthorizedPayload, { sendTextMessage });
    const unauthorizedConversation = await ConversacionWhatsapp.findOne({
      where: { telefono: unauthorizedPhone, estado: 'ACTIVA' }
    });
    const unauthorizedAudit = await AuditoriaWhatsapp.findOne({
      where: { message_id_externo: unauthorizedId, accion: 'NUMERO_NO_AUTORIZADO' }
    });
    const duplicateAudit = await AuditoriaWhatsapp.findOne({
      where: { message_id_externo: incomingId, accion: 'MENSAJE_DUPLICADO' }
    });
    const after = {
      pacientes: await Paciente.count(),
      citas: await Cita.count()
    };
    const evidence = {
      database: process.env.DB_NAME,
      conversation: {
        id: conversation.id,
        origin: conversation.origen_conversacion,
        reference: conversation.referencia_origen,
        state: conversation.estado,
        step: conversation.ultimo_paso
      },
      incoming: {
        id: incoming.message_id_externo,
        direction: incoming.direccion,
        state: incoming.estado_envio,
        referenceRemovedFromStoredText: !incoming.contenido_resumido.includes('REF:WEB-PHYSIO')
      },
      outgoing: {
        id: outgoing.message_id_externo,
        direction: outgoing.direccion,
        state: outgoing.estado_envio,
        delivered: Boolean(outgoing.fecha_entrega),
        read: Boolean(outgoing.fecha_lectura)
      },
      duplicateIgnored: Boolean(duplicate.results[0].duplicate),
      duplicateAudited: Boolean(duplicateAudit),
      unauthorizedNumber: {
        replied: false,
        activeConversationCreated: Boolean(unauthorizedConversation),
        audited: Boolean(unauthorizedAudit)
      },
      recordsUnchanged: {
        pacientes: before.pacientes === after.pacientes,
        citas: before.citas === after.citas
      }
    };
    if (
      evidence.conversation.origin !== 'WEB'
      || evidence.conversation.reference !== 'WEB-PHYSIO'
      || !evidence.duplicateIgnored
      || !evidence.duplicateAudited
      || !evidence.incoming.referenceRemovedFromStoredText
      || evidence.outgoing.state !== 'READ'
      || evidence.unauthorizedNumber.activeConversationCreated
      || !evidence.unauthorizedNumber.audited
      || !evidence.recordsUnchanged.pacientes
      || !evidence.recordsUnchanged.citas
    ) {
      throw new Error('La evidencia de persistencia no cumple los criterios esperados');
    }
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error('Prueba de persistencia fallida:', error.message);
  process.exitCode = 1;
});
