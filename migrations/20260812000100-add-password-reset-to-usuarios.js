'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable('usuarios', { transaction });
      if (!columns.reset_password_token_hash) {
        await queryInterface.addColumn('usuarios', 'reset_password_token_hash', {
          type: DataTypes.STRING(64),
          allowNull: true
        }, { transaction });
      }
      if (!columns.reset_password_expires_at) {
        await queryInterface.addColumn('usuarios', 'reset_password_expires_at', {
          type: DataTypes.DATE,
          allowNull: true
        }, { transaction });
      }
      await queryInterface.sequelize.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS usuarios_reset_password_token_hash_unique ON usuarios (reset_password_token_hash) WHERE reset_password_token_hash IS NOT NULL',
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS usuarios_reset_password_token_hash_unique',
        { transaction }
      );
      const columns = await queryInterface.describeTable('usuarios', { transaction });
      if (columns.reset_password_expires_at) {
        await queryInterface.removeColumn('usuarios', 'reset_password_expires_at', { transaction });
      }
      if (columns.reset_password_token_hash) {
        await queryInterface.removeColumn('usuarios', 'reset_password_token_hash', { transaction });
      }
    });
  }
};
