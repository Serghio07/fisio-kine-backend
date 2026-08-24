'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable('pacientes', { transaction });
      for (const name of ['telefono', 'telefono_normalizado']) {
        if (!columns[name]) throw new Error(`Migración abortada: falta pacientes.${name}`);
        await queryInterface.sequelize.query(
          `ALTER TABLE pacientes ALTER COLUMN ${queryInterface.quoteIdentifier(name)} DROP NOT NULL`,
          { transaction }
        );
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(`
        SELECT count(*)::integer AS total
        FROM pacientes
        WHERE telefono IS NULL OR telefono_normalizado IS NULL
      `, { transaction });
      if (Number(rows[0].total) > 0) {
        throw new Error(`Rollback abortado: existen ${rows[0].total} pacientes sin teléfono personal.`);
      }
      await queryInterface.sequelize.query(`
        ALTER TABLE pacientes ALTER COLUMN telefono SET NOT NULL;
        ALTER TABLE pacientes ALTER COLUMN telefono_normalizado SET NOT NULL
      `, { transaction });
    });
  }
};
