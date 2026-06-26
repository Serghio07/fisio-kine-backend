require('dotenv').config();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const adminUser = process.env.ADMIN_USER || 'admin';

const tablesToClear = [
  'antecedentes_familiares',
  'antecedentes_personales',
  'condicion_actual',
  'evaluacion_final',
  'examen_kinesico',
  'intervencion_clinica',
  'informes_medicos',
  'planilla_sesiones',
  'planillas_atencion_asistencia',
  'planillas_personal_detalle',
  'planillas_personal',
  'registro_semanal',
  'sesiones',
  'tareas_personal',
  'citas',
  'historias_clinicas',
  'personal',
  'pacientes'
];

const quoteIdentifier = (name) => `"${name.replace(/"/g, '""')}"`;

const countTable = async (table, transaction) => {
  const [{ count }] = await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`,
    { type: QueryTypes.SELECT, transaction }
  );
  return count;
};

const clearDemoData = async () => {
  await sequelize.authenticate();

  const result = await sequelize.transaction(async (transaction) => {
    const before = {};
    for (const table of [...tablesToClear, 'usuarios']) {
      before[table] = await countTable(table, transaction);
    }

    await sequelize.query(
      `TRUNCATE ${tablesToClear.map(quoteIdentifier).join(', ')} RESTART IDENTITY CASCADE`,
      { transaction }
    );

    const [deleteResult] = await sequelize.query(
      'DELETE FROM usuarios WHERE usuario <> :adminUser',
      { replacements: { adminUser }, transaction }
    );
    const deletedUsers = deleteResult?.rowCount || 0;

    const [admin] = await sequelize.query(
      'SELECT id, nombre, usuario, email, rol, estado FROM usuarios WHERE usuario = :adminUser LIMIT 1',
      { replacements: { adminUser }, type: QueryTypes.SELECT, transaction }
    );

    if (!admin) {
      throw new Error(`No existe el usuario administrador "${adminUser}". Ejecuta npm run seed:admin primero.`);
    }

    const after = {};
    for (const table of [...tablesToClear, 'usuarios']) {
      after[table] = await countTable(table, transaction);
    }

    return { before, after, deletedUsers, admin };
  });

  console.log(JSON.stringify(result, null, 2));
};

clearDemoData()
  .catch((error) => {
    console.error('No se pudieron limpiar los datos demo:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
