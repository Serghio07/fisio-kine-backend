'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('historial_ampliaciones_sesiones', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        evaluacion_final_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'evaluacion_final', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        historia_clinica_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'historias_clinicas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        total_anterior: { type: Sequelize.INTEGER, allowNull: false },
        incremento: { type: Sequelize.INTEGER, allowNull: false },
        total_nuevo: { type: Sequelize.INTEGER, allowNull: false },
        motivo: { type: Sequelize.STRING(500), allowNull: false },
        creado_por_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        solicitud_id: { type: Sequelize.UUID, allowNull: false, unique: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE historial_ampliaciones_sesiones
        ADD CONSTRAINT historial_ampliaciones_totales_check
          CHECK (total_anterior > 0 AND incremento > 0 AND total_nuevo = total_anterior + incremento),
        ADD CONSTRAINT historial_ampliaciones_motivo_check
          CHECK (BTRIM(motivo) <> '')
      `, { transaction });
      await queryInterface.addIndex('historial_ampliaciones_sesiones', ['historia_clinica_id', 'created_at'], { name: 'historial_ampliaciones_historia_fecha_idx', transaction });
      await queryInterface.addIndex('historial_ampliaciones_sesiones', ['evaluacion_final_id'], { name: 'historial_ampliaciones_evaluacion_idx', transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*)::integer AS total FROM historial_ampliaciones_sesiones', { transaction });
      if (Number(rows[0]?.total || 0) > 0) throw new Error('Rollback bloqueado: existen ampliaciones de sesiones con trazabilidad historica.');
      await queryInterface.dropTable('historial_ampliaciones_sesiones', { transaction });
    });
  }
};
