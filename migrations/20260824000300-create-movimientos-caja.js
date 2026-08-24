'use strict';

const TIPOS = [
  'INGRESO_EXTRAORDINARIO', 'EGRESO', 'APORTE_CAJA',
  'RETIRO_CAJA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'
];
const METODOS = ['Efectivo', 'QR', 'Transferencia', 'Tarjeta', 'Otro'];
const CATEGORIAS = [
  'MATERIAL_MEDICO', 'INSUMOS', 'LIMPIEZA', 'MANTENIMIENTO',
  'SERVICIOS', 'TRANSPORTE', 'PAPELERIA', 'PERSONAL', 'OTROS'
];

const sqlList = (values) => values.map((value) => `'${value}'`).join(', ');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('movimientos_caja', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        fecha: { type: Sequelize.DATEONLY, allowNull: false },
        hora: { type: Sequelize.TIME, allowNull: false },
        tipo_movimiento: { type: Sequelize.STRING(30), allowNull: false },
        categoria: { type: Sequelize.STRING(30), allowNull: true },
        concepto: { type: Sequelize.STRING(180), allowNull: false },
        descripcion: { type: Sequelize.TEXT, allowNull: true },
        motivo: { type: Sequelize.TEXT, allowNull: true },
        monto: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        metodo: { type: Sequelize.STRING(30), allowNull: false },
        usuario_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        arqueo_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'arqueos_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        origen: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
        comprobante: { type: Sequelize.STRING(255), allowNull: true },
        estado: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVO' },
        anulado_por_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        anulado_en: { type: Sequelize.DATE, allowNull: true },
        motivo_anulacion: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE movimientos_caja
          ADD CONSTRAINT movimientos_caja_tipo_check
            CHECK (tipo_movimiento IN (${sqlList(TIPOS)})),
          ADD CONSTRAINT movimientos_caja_metodo_check
            CHECK (metodo IN (${sqlList(METODOS)})),
          ADD CONSTRAINT movimientos_caja_estado_check
            CHECK (estado IN ('ACTIVO', 'ANULADO')),
          ADD CONSTRAINT movimientos_caja_origen_check
            CHECK (origen IN ('MANUAL', 'CIERRE_ARQUEO')),
          ADD CONSTRAINT movimientos_caja_monto_positivo_check
            CHECK (monto > 0),
          ADD CONSTRAINT movimientos_caja_aporte_retiro_efectivo_check
            CHECK (tipo_movimiento NOT IN ('APORTE_CAJA', 'RETIRO_CAJA') OR metodo = 'Efectivo'),
          ADD CONSTRAINT movimientos_caja_categoria_check
            CHECK (
              (tipo_movimiento = 'EGRESO' AND categoria IS NOT NULL AND categoria IN (${sqlList(CATEGORIAS)}))
              OR (tipo_movimiento <> 'EGRESO' AND categoria IS NULL)
            ),
          ADD CONSTRAINT movimientos_caja_ajuste_motivo_check
            CHECK (
              tipo_movimiento NOT IN ('AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO')
              OR (motivo IS NOT NULL AND BTRIM(motivo) <> '')
            ),
          ADD CONSTRAINT movimientos_caja_anulacion_check
            CHECK (
              estado <> 'ANULADO'
              OR (anulado_en IS NOT NULL AND motivo_anulacion IS NOT NULL AND BTRIM(motivo_anulacion) <> '')
            ),
          ADD CONSTRAINT movimientos_caja_cierre_arqueo_check
            CHECK (
              origen <> 'CIERRE_ARQUEO'
              OR (tipo_movimiento = 'RETIRO_CAJA' AND arqueo_id IS NOT NULL)
            );

        CREATE INDEX movimientos_caja_fecha_estado_idx
          ON movimientos_caja (fecha, estado);
        CREATE INDEX movimientos_caja_fecha_tipo_estado_idx
          ON movimientos_caja (fecha, tipo_movimiento, estado);
        CREATE INDEX movimientos_caja_usuario_idx
          ON movimientos_caja (usuario_id);
        CREATE INDEX movimientos_caja_arqueo_idx
          ON movimientos_caja (arqueo_id) WHERE arqueo_id IS NOT NULL;
        CREATE UNIQUE INDEX movimientos_caja_retiro_cierre_unique
          ON movimientos_caja (arqueo_id)
          WHERE origen = 'CIERRE_ARQUEO'
            AND tipo_movimiento = 'RETIRO_CAJA'
            AND arqueo_id IS NOT NULL;
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[row]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*)::integer AS total FROM movimientos_caja',
        { transaction }
      );
      if (Number(row.total) > 0) {
        throw new Error('No se puede revertir la migracion porque existen movimientos de caja registrados.');
      }
      await queryInterface.dropTable('movimientos_caja', { transaction });
    });
  }
};
