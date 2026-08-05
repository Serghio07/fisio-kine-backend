const path = require('path');
const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
require('dotenv').config(envFile ? { path: path.resolve(process.cwd(), envFile) } : undefined);
process.env.TZ = process.env.TZ || 'America/La_Paz';

const app = require('./app');
const { sequelize } = require('./models');
const { startAppointmentReminderJob } = require('./jobs/appointmentReminder.job');
const { startPendingReferralAlertJob } = require('./jobs/pendingReferralAlert.job');

const PORT = process.env.PORT || 3000;

const iniciarServidor = async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres');
    }
    await sequelize.authenticate();
    console.log('Conexion a PostgreSQL establecida');

    if (process.env.DB_SYNC !== 'false') throw new Error('DB_SYNC debe permanecer en false; use migraciones controladas');

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      startAppointmentReminderJob();
      startPendingReferralAlertJob();
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

iniciarServidor();
