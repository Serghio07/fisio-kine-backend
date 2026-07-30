const path = require('path');
const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
require('dotenv').config(envFile ? { path: path.resolve(process.cwd(), envFile) } : undefined);
process.env.TZ = process.env.TZ || 'America/La_Paz';

const app = require('./app');
const { sequelize } = require('./models');
const {
  validateRuntimeSafety,
  safeConfigSummary
} = require('./config/whatsapp');

const PORT = process.env.PORT || 3000;

const iniciarServidor = async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET es obligatorio y debe tener al menos 32 caracteres');
    }
    const whatsappSafety = validateRuntimeSafety();
    if (!whatsappSafety.ready) {
      throw new Error(`Configuracion segura de WhatsApp incompleta: ${whatsappSafety.errors.join(', ')}`);
    }
    const summary = safeConfigSummary();
    console.log('Configuracion WhatsApp cargada:', summary.configurationLoaded ? 'si' : 'no');
    console.log('Webhook WhatsApp habilitado:', summary.webhookEnabled ? 'si' : 'no');
    console.log('Modo de prueba WhatsApp:', summary.testMode ? 'si' : 'no');
    console.log('Numeros de prueba autorizados:', summary.authorizedNumbers);
    console.log('Agendamiento automatico:', summary.appointmentsEnabled ? 'habilitado' : 'desactivado');
    await sequelize.authenticate();
    console.log('Conexion a PostgreSQL establecida');

    if (process.env.DB_SYNC === 'true') {
      await sequelize.sync({ alter: true });
      console.log('Modelos sincronizados con la base de datos');
    }

    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
};

iniciarServidor();
