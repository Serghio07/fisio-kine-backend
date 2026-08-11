'use strict';

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  const columns = await queryInterface.describeTable(tableName, { transaction });
  if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition, { transaction });
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await ensureColumn(queryInterface, 'registro_semanal', 'historia_clinica_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'registro_semanal', 'sesiones_resumen', {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      }, transaction);
      await ensureColumn(queryInterface, 'registro_semanal', 'total_sesiones', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      }, transaction);
      await ensureColumn(queryInterface, 'registro_semanal', 'sincronizado_sesiones', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }, transaction);
      await ensureColumn(queryInterface, 'registro_semanal', 'generado_automaticamente', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }, transaction);

      const indexes = await queryInterface.showIndex('registro_semanal', { transaction });
      if (!indexes.some((index) => index.name === 'idx_registro_semanal_historia')) {
        await queryInterface.addIndex('registro_semanal', ['historia_clinica_id'], {
          name: 'idx_registro_semanal_historia',
          transaction
        });
      }
    });
  },

  async down() {
    // No-op deliberado: la estructura puede preceder al nuevo ledger.
  }
};
