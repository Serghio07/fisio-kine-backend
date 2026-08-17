const { processInternalAppointmentReminders } = require('../services/internalAppointmentReminder.service');
const { getAppointmentInternalReminderScanSeconds, getInternalNotificationsEnabled } = require('../config/whatsapp');

let timer = null;
let running = false;

const runCycle = async (processor = processInternalAppointmentReminders) => {
  if (running) return { skipped: true };
  running = true;
  try {
    return await processor();
  } catch (_) {
    console.error('[Notifications] Error procesando recordatorios internos de citas');
    return { error: true };
  } finally {
    running = false;
  }
};

const startInternalAppointmentReminderJob = (options = {}) => {
  if (process.env.NODE_ENV === 'test' || !getInternalNotificationsEnabled() || timer) return false;
  const processor = options.processor || processInternalAppointmentReminders;
  timer = setInterval(() => { void runCycle(processor); }, getAppointmentInternalReminderScanSeconds() * 1000);
  timer.unref?.();
  void runCycle(processor);
  return true;
};

const stopInternalAppointmentReminderJob = () => {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
};

module.exports = { runCycle, startInternalAppointmentReminderJob, stopInternalAppointmentReminderJob };
