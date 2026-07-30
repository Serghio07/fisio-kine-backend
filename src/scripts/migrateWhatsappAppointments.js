const fs = require('fs');
const path = require('path');

const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
if (!envFile) {
  console.error('Debes indicar un entorno de prueba con --env=.env.whatsapp-test');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

if (process.env.WHATSAPP_TEST_DATABASE !== 'true' || !/test/i.test(process.env.DB_NAME || '')) {
  console.error('Migracion cancelada: la base debe estar marcada como WHATSAPP_TEST_DATABASE=true y contener "test" en su nombre.');
  process.exit(1);
}

const sequelize = require('../config/database');

const requiredCitaColumns = ['canal_origen', 'estado_confirmacion', 'paciente_verificado'];
const requiredTables = [
  'conversaciones_whatsapp',
  'mensajes_whatsapp',
  'reservas_temporales',
  'recordatorios_citas',
  'auditoria_whatsapp',
  'bloqueos_agenda',
  'configuracion_tipos_atencion'
];

async function migrate() {
  try {
    await sequelize.authenticate();
    const sql = fs.readFileSync(path.join(__dirname, '../../docs/whatsapp-appointments-migration.sql'), 'utf8');
    await sequelize.query(sql);
    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable('citas');
    const missingColumns = requiredCitaColumns.filter((column) => !columns[column]);
    const tables = await queryInterface.showAllTables();
    const names = new Set(tables.map((table) => (
      typeof table === 'string' ? table : table.tableName || table.table_name
    )));
    const missingTables = requiredTables.filter((table) => !names.has(table));
    if (missingColumns.length || missingTables.length) throw new Error(`Migración incompleta. Columnas: ${missingColumns.join(', ') || 'ninguna'}; tablas: ${missingTables.join(', ') || 'ninguna'}`);
    console.log('Preparación de WhatsApp aplicada y verificada correctamente.');
  } catch (error) {
    console.error('No se pudo aplicar la preparación de WhatsApp:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
