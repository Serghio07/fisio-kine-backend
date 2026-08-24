'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[before]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE ci IS NOT NULL AND BTRIM(ci) <> '')::integer AS con_ci,
               COUNT(*) FILTER (WHERE ci IS NULL OR BTRIM(ci) = '')::integer AS ci_null
        FROM pacientes
      `, { transaction });
      await queryInterface.addColumn('pacientes', 'tipo_documento', { type: Sequelize.STRING(30), allowNull: true }, { transaction });
      await queryInterface.addColumn('pacientes', 'numero_documento', { type: Sequelize.STRING(50), allowNull: true }, { transaction });
      await queryInterface.addColumn('pacientes', 'numero_documento_normalizado', { type: Sequelize.STRING(50), allowNull: true }, { transaction });
      await queryInterface.addColumn('pacientes', 'nombre_documento_otro', { type: Sequelize.STRING(100), allowNull: true }, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE pacientes
        SET tipo_documento = 'CI',
            numero_documento = BTRIM(ci),
            numero_documento_normalizado = UPPER(REGEXP_REPLACE(BTRIM(ci), '\\s+', ' ', 'g')),
            nombre_documento_otro = NULL
        WHERE ci IS NOT NULL AND BTRIM(ci) <> ''
      `, { transaction });

      const [[duplicate]] = await queryInterface.sequelize.query(`
        SELECT tipo_documento, numero_documento_normalizado, COUNT(*)::integer AS cantidad
        FROM pacientes
        WHERE tipo_documento IS NOT NULL AND numero_documento_normalizado IS NOT NULL
        GROUP BY tipo_documento, numero_documento_normalizado
        HAVING COUNT(*) > 1
        LIMIT 1
      `, { transaction });
      if (duplicate) throw new Error('No se puede aplicar la unicidad documental: existen documentos duplicados después del backfill.');

      const [[after]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*)::integer AS total,
               COUNT(*) FILTER (WHERE ci IS NOT NULL AND BTRIM(ci) <> '' AND tipo_documento = 'CI' AND numero_documento IS NOT NULL)::integer AS migrados
        FROM pacientes
      `, { transaction });
      if (before.total !== after.total) throw new Error('La verificacion del backfill detecto un cambio inesperado en la cantidad de pacientes.');

      await queryInterface.sequelize.query(`
        ALTER TABLE pacientes
        ADD CONSTRAINT pacientes_tipo_documento_check
        CHECK (tipo_documento IS NULL OR tipo_documento IN ('CI','DNI','PASAPORTE','CEDULA','CARNET_EXTRANJERIA','OTRO')),
        ADD CONSTRAINT pacientes_documento_otro_check
        CHECK (tipo_documento <> 'OTRO' OR (nombre_documento_otro IS NOT NULL AND BTRIM(nombre_documento_otro) <> ''))
      `, { transaction });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX pacientes_documento_unique
        ON pacientes (tipo_documento, numero_documento_normalizado)
        WHERE tipo_documento IS NOT NULL AND numero_documento_normalizado IS NOT NULL
      `, { transaction });
      console.info(`[patient-document migration] antes: total=${before.total}, con_ci=${before.con_ci}, ci_null=${before.ci_null}; despues: total=${after.total}, nuevo_documento=${after.migrados}; duplicados=0`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query('DROP INDEX IF EXISTS pacientes_documento_unique', { transaction });
      await queryInterface.sequelize.query('ALTER TABLE pacientes DROP CONSTRAINT IF EXISTS pacientes_documento_otro_check, DROP CONSTRAINT IF EXISTS pacientes_tipo_documento_check', { transaction });
      await queryInterface.removeColumn('pacientes', 'nombre_documento_otro', { transaction });
      await queryInterface.removeColumn('pacientes', 'numero_documento_normalizado', { transaction });
      await queryInterface.removeColumn('pacientes', 'numero_documento', { transaction });
      await queryInterface.removeColumn('pacientes', 'tipo_documento', { transaction });
    });
  }
};
