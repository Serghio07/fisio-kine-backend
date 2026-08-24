'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('operaciones_pago', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        paciente_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pacientes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        historia_clinica_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'historias_clinicas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        fecha: { type: Sequelize.DATEONLY, allowNull: false }, hora: { type: Sequelize.TIME, allowNull: false },
        monto_total: { type: Sequelize.DECIMAL(12, 2), allowNull: false }, metodo: { type: Sequelize.STRING(30), allowNull: false },
        usuario_receptor_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        numero_recibo: { type: Sequelize.STRING(40), allowNull: false, unique: true }, numero_comprobante: Sequelize.STRING(120),
        archivo_comprobante: Sequelize.TEXT, observacion: Sequelize.TEXT,
        tipo: { type: Sequelize.STRING(20), allowNull: false }, estado: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVA' },
        anulado_por_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        anulado_en: Sequelize.DATE, motivo_anulacion: Sequelize.TEXT,
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }, updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction });
      await queryInterface.addColumn('movimientos_pago', 'operacion_pago_id', { type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'operaciones_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' }, { transaction });
      await queryInterface.sequelize.query(`ALTER TABLE operaciones_pago
        ADD CONSTRAINT operaciones_pago_monto_check CHECK (monto_total > 0),
        ADD CONSTRAINT operaciones_pago_metodo_check CHECK (metodo IN ('Efectivo','QR','Transferencia','Tarjeta','Otro')),
        ADD CONSTRAINT operaciones_pago_estado_check CHECK (estado IN ('ACTIVA','ANULADA')),
        ADD CONSTRAINT operaciones_pago_tipo_check CHECK (tipo IN ('ESPECIFICO','DEUDA_HISTORIA')),
        ADD CONSTRAINT operaciones_pago_anulacion_check CHECK (estado <> 'ANULADA' OR (anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND BTRIM(motivo_anulacion) <> ''));
        CREATE INDEX operaciones_pago_fecha_estado_idx ON operaciones_pago(fecha, estado);
        CREATE INDEX operaciones_pago_paciente_historia_idx ON operaciones_pago(paciente_id, historia_clinica_id);
        CREATE INDEX operaciones_pago_receptor_idx ON operaciones_pago(usuario_receptor_id);
        CREATE INDEX movimientos_pago_operacion_idx ON movimientos_pago(operacion_pago_id) WHERE operacion_pago_id IS NOT NULL;`, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[row]] = await queryInterface.sequelize.query('SELECT COUNT(*)::integer total FROM operaciones_pago', { transaction });
      if (Number(row.total) > 0) throw new Error('No se puede revertir: existen operaciones de pago registradas.');
      await queryInterface.removeColumn('movimientos_pago', 'operacion_pago_id', { transaction });
      await queryInterface.dropTable('operaciones_pago', { transaction });
    });
  }
};
