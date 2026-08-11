'use strict';

const foreignKeysForCitas = async (queryInterface, transaction) => {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT tc.constraint_name, kcu.column_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_schema = rc.constraint_schema
     AND tc.constraint_name = rc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'citas'
      AND tc.constraint_type = 'FOREIGN KEY'
  `, { transaction });
  return rows;
};

const assertNoOrphans = async (queryInterface, transaction, column, parentTable) => {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT count(c.id)::integer AS count
    FROM citas c
    LEFT JOIN ${parentTable} parent ON parent.id = c.${column}
    WHERE c.${column} IS NOT NULL AND parent.id IS NULL
  `, { transaction });
  if (Number(rows[0].count) > 0) {
    throw new Error(`Migracion abortada: citas.${column} contiene ${rows[0].count} referencias huerfanas`);
  }
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await assertNoOrphans(queryInterface, transaction, 'paciente_id', 'pacientes');
      await assertNoOrphans(queryInterface, transaction, 'profesional_id', 'usuarios');

      let foreignKeys = await foreignKeysForCitas(queryInterface, transaction);
      const patientKeys = foreignKeys.filter((item) => item.column_name === 'paciente_id');
      if (!patientKeys.some((item) => ['RESTRICT', 'NO ACTION'].includes(item.delete_rule))) {
        throw new Error('Migracion abortada: citas.paciente_id no tiene una FK restrictiva de respaldo');
      }
      for (const constraint of patientKeys.filter((item) => item.delete_rule === 'CASCADE')) {
        await queryInterface.removeConstraint('citas', constraint.constraint_name, { transaction });
      }

      foreignKeys = await foreignKeysForCitas(queryInterface, transaction);
      const professionalKeys = foreignKeys.filter((item) => item.column_name === 'profesional_id');
      if (professionalKeys.length !== 1) {
        throw new Error('Migracion abortada: se esperaba una unica FK para citas.profesional_id');
      }
      const professionalKey = professionalKeys[0];
      if (professionalKey.delete_rule !== 'SET NULL') {
        if (!['RESTRICT', 'NO ACTION'].includes(professionalKey.delete_rule)) {
          throw new Error(`Migracion abortada: regla inesperada ${professionalKey.delete_rule} en citas.profesional_id`);
        }
        await queryInterface.removeConstraint('citas', professionalKey.constraint_name, { transaction });
        await queryInterface.addConstraint('citas', {
          name: professionalKey.constraint_name,
          type: 'foreign key',
          fields: ['profesional_id'],
          references: { table: 'usuarios', field: 'id' },
          onDelete: 'SET NULL',
          transaction
        });
      }
    });
  },

  async down() {
    // Correccion hacia adelante: no se restauran reglas que podrian borrar citas.
  }
};
