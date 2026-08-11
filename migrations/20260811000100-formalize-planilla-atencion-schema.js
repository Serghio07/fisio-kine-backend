'use strict';

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  const columns = await queryInterface.describeTable(tableName, { transaction });
  if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

const ensureIndex = async (queryInterface, tableName, indexName, fields, transaction) => {
  const indexes = await queryInterface.showIndex(tableName, { transaction });
  if (!indexes.some((index) => index.name === indexName)) {
    await queryInterface.addIndex(tableName, fields, { name: indexName, transaction });
  }
};

const ensureConstraint = async (queryInterface, tableName, name, options, transaction) => {
  const constraints = await queryInterface.showConstraint(tableName, { transaction });
  if (!constraints.some((constraint) => constraint.constraintName === name)) {
    await queryInterface.addConstraint(tableName, { ...options, name, transaction });
  }
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await ensureColumn(queryInterface, 'planillas_atencion_asistencia', 'historia_clinica_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planillas_atencion_asistencia', 'observacion', {
        type: Sequelize.TEXT,
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planilla_sesiones', 'sesion_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planilla_sesiones', 'observacion', {
        type: Sequelize.TEXT,
        allowNull: true
      }, transaction);

      await ensureConstraint(queryInterface, 'planillas_atencion_asistencia',
        'planillas_atencion_asistencia_historia_clinica_id_fkey', {
          type: 'foreign key',
          fields: ['historia_clinica_id'],
          references: { table: 'historias_clinicas', field: 'id' },
          onDelete: 'SET NULL'
        }, transaction);
      await ensureConstraint(queryInterface, 'planilla_sesiones', 'planilla_sesiones_sesion_id_fkey', {
        type: 'foreign key',
        fields: ['sesion_id'],
        references: { table: 'sesiones', field: 'id' },
        onDelete: 'SET NULL'
      }, transaction);

      await ensureIndex(queryInterface, 'planillas_atencion_asistencia',
        'idx_planillas_atencion_historia', ['historia_clinica_id'], transaction);
      await ensureIndex(queryInterface, 'planilla_sesiones',
        'idx_planilla_sesiones_sesion', ['sesion_id'], transaction);

      await queryInterface.sequelize.query(`
        UPDATE planilla_sesiones ps
        SET sesion_id = matches.sesion_id
        FROM (
          SELECT ps2.id AS fila_id, MIN(s.id) AS sesion_id
          FROM planilla_sesiones ps2
          JOIN sesiones s
            ON s.paciente_id = ps2.paciente_id
           AND s.fecha = ps2.fecha
           AND s.numero_sesion = ps2.numero_sesion
           AND COALESCE(s.anulada, FALSE) = FALSE
          WHERE ps2.sesion_id IS NULL
          GROUP BY ps2.id
          HAVING COUNT(s.id) = 1
        ) matches
        WHERE ps.id = matches.fila_id
      `, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE planillas_atencion_asistencia pa
        SET historia_clinica_id = matches.historia_clinica_id
        FROM (
          SELECT ps.planilla_id, MIN(s.historia_clinica_id) AS historia_clinica_id
          FROM planilla_sesiones ps
          JOIN sesiones s ON s.id = ps.sesion_id
          WHERE s.historia_clinica_id IS NOT NULL
          GROUP BY ps.planilla_id
          HAVING COUNT(DISTINCT s.historia_clinica_id) = 1
        ) matches
        WHERE pa.id = matches.planilla_id
          AND pa.historia_clinica_id IS NULL
      `, { transaction });
    });
  },

  async down() {
    // No-op deliberado: las columnas y relaciones pueden preceder al nuevo ledger.
  }
};
