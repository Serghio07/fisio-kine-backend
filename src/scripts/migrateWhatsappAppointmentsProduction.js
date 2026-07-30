const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

if (!process.argv.includes('--confirm-production')) {
  console.error('Migracion cancelada: debes indicar --confirm-production.');
  process.exit(1);
}

if (!process.env.DB_NAME) {
  console.error('Migracion cancelada: DB_NAME no esta definido en backend/.env.');
  process.exit(1);
}

const sequelize = require('../config/database');

const requiredPacienteColumns = [
  'estado_registro',
  'origen_registro',
  'origen_registro_detalle',
  'datos_clinicos_estado',
  'tipo_documento',
  'ci_numero',
  'ci_complemento',
  'ci_expedido',
  'telefono_normalizado',
  'email',
  'consentimiento_datos_en'
];

const requiredCitaColumns = [
  'canal_origen',
  'referencia_origen',
  'estado_confirmacion',
  'fecha_confirmacion',
  'whatsapp_message_id',
  'whatsapp_conversation_id',
  'reserva_temporal_id',
  'paciente_verificado',
  'metodo_verificacion',
  'fecha_ultima_notificacion',
  'motivo_reprogramacion',
  'canal_cancelacion',
  'fecha_cancelacion'
];

const requiredTables = [
  'conversaciones_whatsapp',
  'mensajes_whatsapp',
  'reservas_temporales',
  'recordatorios_citas',
  'auditoria_whatsapp',
  'bloqueos_agenda',
  'configuracion_tipos_atencion'
];

const tableName = (table) => (
  typeof table === 'string' ? table : table.tableName || table.table_name
);

async function missingColumns(queryInterface, table, requiredColumns) {
  const columns = await queryInterface.describeTable(table);
  return requiredColumns.filter((column) => !columns[column]);
}

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log(`Aplicando migracion WhatsApp en la base "${process.env.DB_NAME}"...`);

    const sql = fs.readFileSync(
      path.join(__dirname, '../../docs/whatsapp-appointments-migration.sql'),
      'utf8'
    );
    await sequelize.query(sql);

    const queryInterface = sequelize.getQueryInterface();
    const missingPacienteColumns = await missingColumns(
      queryInterface,
      'pacientes',
      requiredPacienteColumns
    );
    const missingCitaColumns = await missingColumns(
      queryInterface,
      'citas',
      requiredCitaColumns
    );
    const tables = new Set((await queryInterface.showAllTables()).map(tableName));
    const missingTables = requiredTables.filter((table) => !tables.has(table));

    if (
      missingPacienteColumns.length
      || missingCitaColumns.length
      || missingTables.length
    ) {
      throw new Error(
        [
          `Columnas de pacientes: ${missingPacienteColumns.join(', ') || 'ninguna'}`,
          `columnas de citas: ${missingCitaColumns.join(', ') || 'ninguna'}`,
          `tablas: ${missingTables.join(', ') || 'ninguna'}`
        ].join('; ')
      );
    }

    console.log('Migracion WhatsApp aplicada y verificada correctamente.');
  } catch (error) {
    console.error('No se pudo migrar la base real:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

migrate();
