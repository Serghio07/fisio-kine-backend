'use strict';

const ensureColumn = async (queryInterface, tableName, columnName, definition, transaction) => {
  const columns = await queryInterface.describeTable(tableName, { transaction });
  if (!columns[columnName]) await queryInterface.addColumn(tableName, columnName, definition, { transaction });
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
      await ensureColumn(queryInterface, 'planillas_personal', 'fecha_planilla', {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_DATE')
      }, transaction);
      await ensureColumn(queryInterface, 'planillas_personal', 'estado', {
        type: Sequelize.STRING(15),
        allowNull: false,
        defaultValue: 'borrador'
      }, transaction);
      for (const columnName of ['cerrada_en', 'reabierta_en', 'anulada_en']) {
        await ensureColumn(queryInterface, 'planillas_personal', columnName, {
          type: Sequelize.DATE,
          allowNull: true
        }, transaction);
      }
      await ensureColumn(queryInterface, 'planillas_personal', 'motivo_anulacion', {
        type: Sequelize.TEXT,
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planillas_personal_detalle', 'monto_servicio', {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planillas_personal_detalle', 'estado_laboral', {
        type: Sequelize.STRING(20),
        allowNull: true
      }, transaction);
      await ensureColumn(queryInterface, 'planillas_personal_detalle', 'firma', {
        type: Sequelize.STRING(255),
        allowNull: true
      }, transaction);

      await queryInterface.sequelize.query(
        "UPDATE planillas_personal SET estado = 'borrador' WHERE estado IS NULL",
        { transaction }
      );
      await queryInterface.sequelize.query(
        "UPDATE planillas_personal_detalle SET estado_laboral = 'activo' WHERE estado_laboral IS NULL",
        { transaction }
      );

      await ensureConstraint(queryInterface, 'planillas_personal_detalle',
        'planilla_detalle_tipo_pago_check', {
          type: 'check',
          fields: ['tipo_pago'],
          where: { tipo_pago: ['mensual', 'por_servicio', 'otro'] }
        }, transaction);
      await ensureConstraint(queryInterface, 'personal', 'personal_tipo_pago_check', {
        type: 'check',
        fields: ['tipo_pago'],
        where: { tipo_pago: ['mensual', 'por_servicio', 'otro'] }
        }, transaction);
    });
  },

  async down() {
    // No-op deliberado: no se elimina estructura que puede existir desde la baseline.
  }
};
