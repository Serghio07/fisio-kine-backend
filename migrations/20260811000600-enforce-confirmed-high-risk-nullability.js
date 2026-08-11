'use strict';

const requiredColumns = [
  ['pacientes', 'apellidos'],
  ['pacientes', 'telefono'],
  ['sesiones', 'sesiones_debe'],
  ['sesiones', 'sesiones_hizo'],
  ['sesiones', 'asistencia'],
  ['informes_medicos', 'historia_clinica_id'],
  ['tareas_personal', 'paciente_id']
];

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const [tableName, columnName] of requiredColumns) {
        const columns = await queryInterface.describeTable(tableName, { transaction });
        if (!columns[columnName]) {
          throw new Error(`Migracion abortada: falta ${tableName}.${columnName}`);
        }
        if (columns[columnName].allowNull === false) continue;

        const table = quoteIdentifier(tableName);
        const column = quoteIdentifier(columnName);
        const [rows] = await queryInterface.sequelize.query(
          `SELECT count(id)::integer AS count FROM ${table} WHERE ${column} IS NULL`,
          { transaction }
        );
        if (Number(rows[0].count) > 0) {
          throw new Error(`Migracion abortada: ${tableName}.${columnName} contiene ${rows[0].count} valores NULL`);
        }

        await queryInterface.sequelize.query(
          `ALTER TABLE ${table} ALTER COLUMN ${column} SET NOT NULL`,
          { transaction }
        );
      }
    });
  },

  async down() {
    // Correccion hacia adelante: no se debilitan restricciones de datos confirmadas.
  }
};
