'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roles_permisos', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      rol: { type: Sequelize.STRING(30), allowNull: false },
      modulo: { type: Sequelize.STRING(80), allowNull: false },
      acciones: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      actualizado_por_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });
    await queryInterface.addConstraint('roles_permisos', { fields: ['rol', 'modulo'], type: 'unique', name: 'roles_permisos_rol_modulo_unique' });
  },
  async down(queryInterface) { await queryInterface.dropTable('roles_permisos'); }
};
