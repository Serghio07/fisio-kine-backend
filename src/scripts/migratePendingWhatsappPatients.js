const sequelize = require('../config/database');
const { Op } = require('sequelize');
const { WhatsappReceptionReferral, WhatsappSolicitudCita, Paciente, Cita } = require('../models');
const availability = require('../services/appointmentAvailability.service');

const run = async () => {
  await sequelize.query('ALTER TABLE pacientes ALTER COLUMN ci DROP NOT NULL; ALTER TABLE pacientes ALTER COLUMN sexo DROP NOT NULL;');
  const referrals = await WhatsappReceptionReferral.findAll({ where: { tipo_derivacion: 'REGISTRO_PACIENTE', paciente_id: null }, include: [{ model: WhatsappSolicitudCita, as: 'solicitud', required: true, where: { estado: 'DERIVADA_PERSONAL' } }] });
  let migrated = 0; let conflicts = 0;
  for (const row of referrals) {
    await sequelize.transaction(async (transaction) => {
      const referral = await WhatsappReceptionReferral.findByPk(row.id, { include: [{ model: WhatsappSolicitudCita, as: 'solicitud', required: true }], transaction, lock: transaction.LOCK.UPDATE });
      if (!referral || referral.paciente_id) return;
      const request = referral.solicitud; const fullName = String(request.nombre_whatsapp || 'Paciente pendiente').trim().replace(/\s+/g, ' '); const parts = fullName.split(' ');
      let patient = await Paciente.findOne({ where: { telefono_normalizado: referral.telefono_normalizado }, transaction, lock: transaction.LOCK.UPDATE });
      if (!patient) patient = await Paciente.create({ nombres: parts.shift(), apellidos: parts.join(' ') || 'PENDIENTE', ci: null, sexo: null, telefono: referral.telefono_normalizado, telefono_normalizado: referral.telefono_normalizado, estado: true, registro_pendiente: true }, { transaction });
      let appointment = request.cita_id ? await Cita.findByPk(request.cita_id, { transaction }) : null;
      if (!appointment && request.fecha_solicitada && request.hora_inicio && request.hora_fin) {
        await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:slotKey))', { replacements: { slotKey: `whatsapp-appointment:${request.fecha_solicitada}` }, transaction });
        const free = await availability.revalidateSlotCapacity({ slot: { date: request.fecha_solicitada, start: String(request.hora_inicio).slice(0, 5), end: String(request.hora_fin).slice(0, 5) }, appointmentModel: Cita, transaction, now: new Date() });
        if (free) appointment = await Cita.create({ paciente_id: patient.id, fecha: request.fecha_solicitada, hora_inicio: request.hora_inicio, hora_fin: request.hora_fin, motivo: request.motivo ? String(request.motivo).slice(0, 255) : null, tipo_atencion: 'Sesion de fisioterapia', estado: 'Pendiente', origen: 'WhatsApp', historial_programacion: [] }, { transaction });
        else conflicts += 1;
      }
      await request.update({ paciente_id: patient.id, ...(appointment ? { cita_id: appointment.id, estado: 'CONFIRMADA', paso_actual: 'CITA_CREADA' } : {}) }, { transaction });
      await referral.update({ paciente_id: patient.id, estado: 'PENDIENTE', responsable_usuario_id: null, tomada_en: null, resuelta_en: null, cerrada_en: null, resolucion: null, ...(appointment ? { cita_id: appointment.id } : {}) }, { transaction }); migrated += 1;
    });
  }
  console.log(JSON.stringify({ migrated, conflicts }));
};
run().then(() => sequelize.close()).catch(async (error) => { console.error(error.message); await sequelize.close(); process.exitCode = 1; });
