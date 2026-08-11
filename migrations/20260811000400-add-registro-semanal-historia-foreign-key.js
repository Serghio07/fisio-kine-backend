'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable('registro_semanal', { transaction });
      if (!columns.historia_clinica_id) {
        throw new Error('Migracion abortada: falta registro_semanal.historia_clinica_id');
      }

      const [orphans] = await queryInterface.sequelize.query(`
        SELECT count(r.id)::integer AS count
        FROM registro_semanal r
        LEFT JOIN historias_clinicas h ON h.id = r.historia_clinica_id
        WHERE r.historia_clinica_id IS NOT NULL AND h.id IS NULL
      `, { transaction });
      if (Number(orphans[0].count) > 0) {
        throw new Error(`Migracion abortada: existen ${orphans[0].count} registros semanales con historia inexistente`);
      }

      const [foreignKeys] = await queryInterface.sequelize.query(`
        SELECT tc.constraint_name, rc.delete_rule, rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.constraint_name = kcu.constraint_name
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_schema = rc.constraint_schema
         AND tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'registro_semanal'
          AND tc.constraint_type = 'FOREIGN KEY'
          AND kcu.column_name = 'historia_clinica_id'
      `, { transaction });

      if (foreignKeys.length) {
        const expected = foreignKeys.some((item) => item.delete_rule === 'SET NULL');
        if (!expected) throw new Error('Migracion abortada: la FK semanal existente tiene una regla diferente');
        return;
      }

      await queryInterface.addConstraint('registro_semanal', {
        name: 'registro_semanal_historia_clinica_id_fkey',
        type: 'foreign key',
        fields: ['historia_clinica_id'],
        references: { table: 'historias_clinicas', field: 'id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      });
    });
  },

  async down() {
    // Correccion hacia adelante: no se retira una proteccion referencial aplicada.
  }
};
