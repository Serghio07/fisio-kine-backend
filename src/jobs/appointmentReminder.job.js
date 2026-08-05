const { getWhatsappRemindersEnabled, getWhatsappReminderScanIntervalMinutes } = require('../config/whatsapp');
const { processDueAppointmentReminders } = require('../services/appointmentReminder.service');
const {recordJob}=require('../services/whatsappJobMonitoring.service');

let timer = null; let running = false;
const runCycle = async (processor = processDueAppointmentReminders) => {
  if (running) return { skipped: true };
  running = true;
  try { return await processor(); } catch (_) { console.error('[WhatsApp] Error procesando recordatorio'); return { error: true }; } finally { running = false; }
};
const startAppointmentReminderJob = (options = {}) => {
  if (process.env.NODE_ENV === 'test' || !getWhatsappRemindersEnabled() || timer) return false;
  const base = options.processor || processDueAppointmentReminders; const processor=()=>recordJob('RECORDATORIOS_CITA',base);
  timer = setInterval(() => { runCycle(processor); }, getWhatsappReminderScanIntervalMinutes() * 60000);
  timer.unref?.(); runCycle(processor); return true;
};
const stopAppointmentReminderJob = () => { if (timer) clearInterval(timer); timer = null; running = false; };
module.exports = { runCycle, startAppointmentReminderJob, stopAppointmentReminderJob };
