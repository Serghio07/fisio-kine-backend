'use strict';

const constraintName = 'intervencion_clinica_trofismo_valido';
const allowedValues = "'CONSERVADO', 'DISMINUIDO', 'AUMENTADO', 'ALTERADO'";

module.exports = {
  async up(queryInterface) {
    const [columns] = await queryInterface.sequelize.query(`
      SELECT data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'intervencion_clinica'
        AND column_name = 'trofismo'
    `);

    if (columns.length !== 1) {
      throw new Error('Migración abortada: falta intervencion_clinica.trofismo');
    }

    if (columns[0].data_type === 'USER-DEFINED') {
      const enumName = String(columns[0].udt_name).replaceAll('"', '""');
      await queryInterface.sequelize.query(`ALTER TYPE "${enumName}" ADD VALUE IF NOT EXISTS 'ALTERADO'`);
      return;
    }

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        UPDATE intervencion_clinica
        SET trofismo = UPPER(trofismo)
        WHERE trofismo IS NOT NULL AND trofismo <> UPPER(trofismo)
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE intervencion_clinica
        DROP CONSTRAINT IF EXISTS ${constraintName}
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE intervencion_clinica
        ADD CONSTRAINT ${constraintName}
        CHECK (trofismo IS NULL OR trofismo IN (${allowedValues}))
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE intervencion_clinica
      DROP CONSTRAINT IF EXISTS ${constraintName}
    `);
  }
};
