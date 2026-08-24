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
      await queryInterface.createTable('arqueo_movimientos_caja_snapshot', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        arqueo_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'arqueos_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT'
        },
        movimiento_caja_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'movimientos_caja', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        fecha: { type: Sequelize.DATEONLY, allowNull: false },
        hora: { type: Sequelize.TIME, allowNull: false },
        tipo_movimiento_snapshot: { type: Sequelize.STRING(30), allowNull: false },
        categoria_snapshot: { type: Sequelize.STRING(30), allowNull: true },
        concepto_snapshot: { type: Sequelize.STRING(180), allowNull: false },
        descripcion_snapshot: { type: Sequelize.TEXT, allowNull: true },
        motivo_snapshot: { type: Sequelize.TEXT, allowNull: true },
        monto_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        metodo_snapshot: { type: Sequelize.STRING(30), allowNull: false },
        estado_snapshot: { type: Sequelize.STRING(20), allowNull: false },
        origen_snapshot: { type: Sequelize.STRING(20), allowNull: false },
        usuario_id: {
          type: Sequelize.INTEGER, allowNull: true,
          references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
        },
        usuario_snapshot: { type: Sequelize.STRING(180), allowNull: true },
        comprobante_snapshot: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE arqueo_movimientos_caja_snapshot
          ADD CONSTRAINT arqueo_mov_caja_snapshot_monto_check
            CHECK (monto_snapshot > 0),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_tipo_check
            CHECK (tipo_movimiento_snapshot IN (${sqlList(TIPOS)})),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_metodo_check
            CHECK (metodo_snapshot IN (${sqlList(METODOS)})),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_estado_check
            CHECK (estado_snapshot IN ('ACTIVO', 'ANULADO')),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_origen_check
            CHECK (origen_snapshot IN ('MANUAL', 'CIERRE_ARQUEO')),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_categoria_check
            CHECK (
              (tipo_movimiento_snapshot = 'EGRESO'
                AND categoria_snapshot IS NOT NULL
                AND categoria_snapshot IN (${sqlList(CATEGORIAS)}))
              OR (tipo_movimiento_snapshot <> 'EGRESO' AND categoria_snapshot IS NULL)
            ),
          ADD CONSTRAINT arqueo_mov_caja_snapshot_arqueo_mov_unique
            UNIQUE (arqueo_id, movimiento_caja_id);

        CREATE INDEX arqueo_mov_caja_snapshot_movimiento_idx
          ON arqueo_movimientos_caja_snapshot (movimiento_caja_id);
        CREATE UNIQUE INDEX arqueo_mov_caja_snapshot_movimiento_unique
          ON arqueo_movimientos_caja_snapshot (movimiento_caja_id)
          WHERE movimiento_caja_id IS NOT NULL;
        CREATE INDEX arqueo_mov_caja_snapshot_fecha_idx
          ON arqueo_movimientos_caja_snapshot (fecha);
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[row]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*)::integer AS total FROM arqueo_movimientos_caja_snapshot',
        { transaction }
      );
      if (Number(row.total) > 0) {
        throw new Error('No se puede revertir la migración porque existen snapshots de movimientos de caja registrados.');
      }
      await queryInterface.dropTable('arqueo_movimientos_caja_snapshot', { transaction });
    });
  }
};
