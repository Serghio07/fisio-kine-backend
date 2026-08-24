const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();
const migration = require('../../migrations/20260824000100-create-clinical-history-attachments');

const database = process.argv[2];
if (!/^fisio_kine_adjuntos_validation_[0-9]+$/.test(database || '')) throw new Error('Base temporal inválida.');
const sequelize = new Sequelize(database, process.env.DB_USER, process.env.DB_PASSWORD, { host: process.env.DB_HOST, port: process.env.DB_PORT, dialect: 'postgres', logging: false });
const qi = sequelize.getQueryInterface();

const prerequisite = async () => {
  for (const table of ['adjuntos_historia_clinica', 'sesiones', 'historias_clinicas', 'pacientes', 'usuarios']) await qi.dropTable(table, { cascade: true }).catch(() => {});
  await qi.createTable('pacientes', { id: { type: DataTypes.INTEGER, primaryKey: true } });
  await qi.createTable('usuarios', { id: { type: DataTypes.INTEGER, primaryKey: true } });
  await qi.createTable('historias_clinicas', { id: { type: DataTypes.INTEGER, primaryKey: true }, paciente_id: { type: DataTypes.INTEGER, allowNull: false } });
  await qi.createTable('sesiones', { id: { type: DataTypes.INTEGER, primaryKey: true }, paciente_id: { type: DataTypes.INTEGER, allowNull: false }, historia_clinica_id: { type: DataTypes.INTEGER, allowNull: false } });
};

(async () => {
  await prerequisite();
  await migration.up(qi, Sequelize);
  const columns = await qi.describeTable('adjuntos_historia_clinica');
  const indexes = await qi.showIndex('adjuntos_historia_clinica');
  const fks = await qi.getForeignKeyReferencesForTable('adjuntos_historia_clinica');
  await sequelize.query('INSERT INTO pacientes(id) VALUES (1), (2); INSERT INTO usuarios(id) VALUES (1); INSERT INTO historias_clinicas(id,paciente_id) VALUES (10,1), (20,2); INSERT INTO sesiones(id,paciente_id,historia_clinica_id) VALUES (100,1,10), (200,2,20);');
  await sequelize.query("INSERT INTO adjuntos_historia_clinica(paciente_id,historia_clinica_id,sesion_id,tipo_adjunto,titulo,archivo,nombre_archivo_original,mime_type,tamano_bytes,creado_por_id,created_at,updated_at) VALUES (1,10,NULL,'RADIOGRAFIA','Prueba','safe.pdf','original.pdf','application/pdf',4,1,NOW(),NOW())");
  let rollbackBlocked = false;
  try { await migration.down(qi); } catch (error) { rollbackBlocked = /Rollback bloqueado/.test(error.message); }
  await sequelize.query('DELETE FROM adjuntos_historia_clinica');
  await migration.down(qi);
  await migration.up(qi, Sequelize);
  const reapplied = Boolean((await qi.describeTable('adjuntos_historia_clinica')).id);
  await sequelize.query('DELETE FROM sesiones; DELETE FROM historias_clinicas; DELETE FROM pacientes; DELETE FROM usuarios;');
  console.log(JSON.stringify({
    columns: Object.keys(columns),
    indexes: indexes.map((item) => item.name),
    foreignKeys: fks.map((item) => `${item.columnName}->${item.referencedTableName}.${item.referencedColumnName}`),
    rollbackBlocked,
    rollbackEmptySucceeded: true,
    reapplied,
    syntheticDataCleaned: true
  }, null, 2));
})().finally(() => sequelize.close());
