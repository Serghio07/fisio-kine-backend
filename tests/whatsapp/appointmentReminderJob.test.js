const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runCycle, startAppointmentReminderJob, stopAppointmentReminderJob
} = require('../../src/jobs/appointmentReminder.job');

test.afterEach(() => stopAppointmentReminderJob());

test('job no inicia durante pruebas ni cuando esta desactivado', { concurrency: false }, () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnabled = process.env.WHATSAPP_REMINDERS_ENABLED;
  try {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_REMINDERS_ENABLED = 'true';
    assert.equal(startAppointmentReminderJob({ processor: async () => assert.fail('no debe ejecutar') }), false);
    process.env.NODE_ENV = 'development';
    process.env.WHATSAPP_REMINDERS_ENABLED = 'TRUE';
    assert.equal(startAppointmentReminderJob({ processor: async () => assert.fail('no debe ejecutar') }), false);
  } finally {
    if (previousNodeEnv == null) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousEnabled == null) delete process.env.WHATSAPP_REMINDERS_ENABLED; else process.env.WHATSAPP_REMINDERS_ENABLED = previousEnabled;
  }
});

test('ciclo superpuesto se omite y un error no escapa al servidor', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const first = runCycle(async () => pending);
  assert.deepEqual(await runCycle(async () => assert.fail('no debe superponerse')), { skipped: true });
  release({ processed: 1 });
  assert.deepEqual(await first, { processed: 1 });
  assert.deepEqual(await runCycle(async () => { throw new Error('fallo controlado'); }), { error: true });
});
