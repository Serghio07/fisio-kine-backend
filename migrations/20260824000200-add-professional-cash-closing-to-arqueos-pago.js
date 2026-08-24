'use strict';

const MIGRATION_NAME = '20260824000200-add-professional-cash-closing-to-arqueos-pago';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const addColumn = (name, definition) => queryInterface.addColumn('arqueos_pago', name, definition, { transaction });

      await addColumn('numero_arqueo', { type: Sequelize.STRING(30), allowNull: true });
      await addColumn('fecha_operativa', { type: Sequelize.DATEONLY, allowNull: true });
      await addColumn('saldo_inicial_efectivo', { type: Sequelize.DECIMAL(12, 2), allowNull: true, defaultValue: 0 });
      await addColumn('saldo_inicial_origen_arqueo_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'arqueos_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
      });
      await addColumn('saldo_inicial_manual', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
      await addColumn('saldo_inicial_definido_por_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL'
      });
      await addColumn('saldo_inicial_definido_en', { type: Sequelize.DATE, allowNull: true });
      await addColumn('efectivo_esperado_cierre', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('otro_sistema', { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 });
      await addColumn('otro_confirmado', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('diferencia_efectivo', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('diferencia_qr', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('diferencia_transferencia', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('diferencia_tarjeta', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('diferencia_otro', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('monto_retirado', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('saldo_dejado_caja', { type: Sequelize.DECIMAL(12, 2), allowNull: true });
      await addColumn('resultado_cierre', { type: Sequelize.STRING(20), allowNull: true });
      await addColumn('snapshot_resumen', { type: Sequelize.JSONB, allowNull: true });

      await queryInterface.createTable('arqueo_movimientos_snapshot', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        arqueo_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'arqueos_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        movimiento_pago_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'movimientos_pago', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        fecha: { type: Sequelize.DATEONLY, allowNull: false },
        hora: { type: Sequelize.TIME, allowNull: true },
        paciente_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'pacientes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        paciente_nombre_snapshot: { type: Sequelize.STRING(320), allowNull: false },
        documento_snapshot: { type: Sequelize.STRING(80), allowNull: true },
        historia_clinica_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'historias_clinicas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        historia_snapshot: { type: Sequelize.STRING(120), allowNull: true },
        concepto_snapshot: { type: Sequelize.STRING(500), allowNull: false },
        metodo_snapshot: { type: Sequelize.STRING(30), allowNull: false },
        monto_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        estado_snapshot: { type: Sequelize.STRING(20), allowNull: false },
        recibido_por_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        recibido_por_snapshot: { type: Sequelize.STRING(120), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE arqueos_pago a
        SET numero_arqueo = 'ARQ-' || TO_CHAR(a.fecha_desde, 'YYYYMMDD') || '-' || a.id::text,
            fecha_operativa = CASE WHEN a.fecha_desde = a.fecha_hasta THEN a.fecha_desde ELSE NULL END,
            saldo_inicial_efectivo = 0,
            saldo_inicial_manual = false,
            efectivo_esperado_cierre = a.efectivo_sistema,
            otro_sistema = COALESCE((
              SELECT SUM(m.monto) FROM movimientos_pago m
              WHERE m.arqueo_id = a.id AND LOWER(BTRIM(m.metodo)) = 'otro'
            ), 0),
            diferencia_efectivo = a.diferencia,
            diferencia_qr = CASE WHEN a.qr_confirmado IS NOT NULL THEN a.qr_confirmado - a.qr_sistema END,
            diferencia_transferencia = CASE WHEN a.transferencia_confirmada IS NOT NULL THEN a.transferencia_confirmada - a.transferencia_sistema END,
            diferencia_tarjeta = CASE WHEN a.tarjeta_confirmada IS NOT NULL THEN a.tarjeta_confirmada - a.tarjeta_sistema END,
            monto_retirado = 0,
            saldo_dejado_caja = CASE WHEN a.efectivo_contado IS NOT NULL THEN a.efectivo_contado END,
            resultado_cierre = CASE WHEN a.estado = 'Cerrado' THEN
              CASE WHEN COALESCE(a.diferencia, 0) = 0
                     AND COALESCE(a.qr_confirmado - a.qr_sistema, 0) = 0
                     AND COALESCE(a.transferencia_confirmada - a.transferencia_sistema, 0) = 0
                     AND COALESCE(a.tarjeta_confirmada - a.tarjeta_sistema, 0) = 0
                   THEN 'CUADRADO' ELSE 'CON_DIFERENCIA' END
            END,
            snapshot_resumen = CASE WHEN a.estado = 'Cerrado' THEN jsonb_build_object(
              'numero_arqueo', 'ARQ-' || TO_CHAR(a.fecha_desde, 'YYYYMMDD') || '-' || a.id::text,
              'fecha', CASE WHEN a.fecha_desde = a.fecha_hasta THEN a.fecha_desde ELSE NULL END,
              'fecha_desde', a.fecha_desde, 'fecha_hasta', a.fecha_hasta,
              'total_esperado', a.total_esperado, 'total_cobrado', a.total_cobrado,
              'total_pendiente', a.total_pendiente, 'efectivo_sistema', a.efectivo_sistema,
              'efectivo_contado', a.efectivo_contado, 'qr_sistema', a.qr_sistema,
              'qr_confirmado', a.qr_confirmado, 'transferencia_sistema', a.transferencia_sistema,
              'transferencia_confirmada', a.transferencia_confirmada, 'tarjeta_sistema', a.tarjeta_sistema,
              'tarjeta_confirmada', a.tarjeta_confirmada, 'otro_sistema', COALESCE((
                SELECT SUM(m.monto) FROM movimientos_pago m WHERE m.arqueo_id = a.id AND LOWER(BTRIM(m.metodo)) = 'otro'
              ), 0),
              'diferencia', a.diferencia, 'cantidad_movimientos', a.cantidad_movimientos,
              'pacientes_deuda', a.pacientes_deuda, 'observacion', a.observacion,
              'estado', a.estado, 'cerrado_en', a.cerrado_en, 'backfill_historico', true,
              'nota_backfill', 'Snapshot creado durante migracion con el estado existente en ese momento; no confirma saldo inicial, retiro ni saldo dejado historicos.'
            ) END
      `, { transaction });

      await queryInterface.sequelize.query(`
        INSERT INTO arqueo_movimientos_snapshot (
          arqueo_id, movimiento_pago_id, fecha, hora, paciente_id,
          paciente_nombre_snapshot, documento_snapshot, historia_clinica_id,
          historia_snapshot, concepto_snapshot, metodo_snapshot, monto_snapshot,
          estado_snapshot, recibido_por_id, recibido_por_snapshot, created_at, updated_at
        )
        SELECT m.arqueo_id, m.id, m.fecha, m.hora, c.paciente_id,
               COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.nombres, p.apellidos)), ''), 'Paciente no disponible'),
               COALESCE(NULLIF(BTRIM(p.numero_documento), ''), NULLIF(BTRIM(p.ci), '')),
               c.historia_clinica_id, NULL,
               COALESCE(NULLIF(BTRIM(c.detalle), ''), NULLIF(BTRIM(c.tipo), ''), 'Concepto no disponible'),
               m.metodo, m.monto, m.estado, m.usuario_receptor_id, u.nombre, NOW(), NOW()
        FROM movimientos_pago m
        JOIN conceptos_cobro c ON c.id = m.concepto_cobro_id
        LEFT JOIN pacientes p ON p.id = c.paciente_id
        LEFT JOIN usuarios u ON u.id = m.usuario_receptor_id
        WHERE m.arqueo_id IS NOT NULL
        ON CONFLICT DO NOTHING
      `, { transaction });

      await queryInterface.changeColumn('arqueos_pago', 'numero_arqueo', { type: Sequelize.STRING(30), allowNull: false }, { transaction });
      await queryInterface.changeColumn('arqueos_pago', 'saldo_inicial_efectivo', { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE arqueos_pago
          ADD CONSTRAINT arqueos_pago_numero_arqueo_unique UNIQUE (numero_arqueo),
          ADD CONSTRAINT arqueos_pago_saldo_inicial_no_negativo CHECK (saldo_inicial_efectivo >= 0),
          ADD CONSTRAINT arqueos_pago_efectivo_esperado_no_negativo CHECK (efectivo_esperado_cierre IS NULL OR efectivo_esperado_cierre >= 0),
          ADD CONSTRAINT arqueos_pago_efectivo_contado_no_negativo CHECK (efectivo_contado >= 0),
          ADD CONSTRAINT arqueos_pago_otro_sistema_no_negativo CHECK (otro_sistema >= 0),
          ADD CONSTRAINT arqueos_pago_otro_confirmado_no_negativo CHECK (otro_confirmado IS NULL OR otro_confirmado >= 0),
          ADD CONSTRAINT arqueos_pago_monto_retirado_no_negativo CHECK (monto_retirado IS NULL OR monto_retirado >= 0),
          ADD CONSTRAINT arqueos_pago_saldo_dejado_no_negativo CHECK (saldo_dejado_caja IS NULL OR saldo_dejado_caja >= 0),
          ADD CONSTRAINT arqueos_pago_resultado_cierre_check CHECK (resultado_cierre IS NULL OR resultado_cierre IN ('CUADRADO', 'CON_DIFERENCIA')),
          ADD CONSTRAINT arqueos_pago_retiro_hasta_contado_check CHECK (monto_retirado IS NULL OR efectivo_contado IS NULL OR monto_retirado <= efectivo_contado),
          ADD CONSTRAINT arqueos_pago_saldo_dejado_consistente_check CHECK (
            saldo_dejado_caja IS NULL OR efectivo_contado IS NULL OR monto_retirado IS NULL
            OR saldo_dejado_caja = efectivo_contado - monto_retirado
          );
        ALTER TABLE arqueo_movimientos_snapshot
          ADD CONSTRAINT arqueo_mov_snapshot_monto_positivo_check CHECK (monto_snapshot > 0),
          ADD CONSTRAINT arqueo_mov_snapshot_arqueo_movimiento_unique UNIQUE (arqueo_id, movimiento_pago_id);
        CREATE UNIQUE INDEX arqueos_pago_fecha_operativa_cerrado_unique
          ON arqueos_pago (fecha_operativa)
          WHERE estado = 'Cerrado' AND fecha_operativa IS NOT NULL;
        CREATE INDEX arqueo_mov_snapshot_movimiento_idx ON arqueo_movimientos_snapshot (movimiento_pago_id);
        CREATE INDEX arqueo_mov_snapshot_fecha_idx ON arqueo_movimientos_snapshot (fecha);
        CREATE INDEX arqueo_mov_snapshot_historia_idx ON arqueo_movimientos_snapshot (historia_clinica_id);
      `, { transaction });

      console.info(`[${MIGRATION_NAME}] estructura profesional y backfill historico completados`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [[professional]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*)::integer AS total
        FROM arqueos_pago a
        WHERE a.numero_arqueo IS DISTINCT FROM ('ARQ-' || TO_CHAR(a.fecha_desde, 'YYYYMMDD') || '-' || a.id::text)
           OR a.fecha_operativa IS DISTINCT FROM (CASE WHEN a.fecha_desde = a.fecha_hasta THEN a.fecha_desde ELSE NULL END)
           OR a.saldo_inicial_efectivo <> 0 OR a.saldo_inicial_manual
           OR a.saldo_inicial_origen_arqueo_id IS NOT NULL OR a.saldo_inicial_definido_por_id IS NOT NULL
           OR a.saldo_inicial_definido_en IS NOT NULL
           OR a.efectivo_esperado_cierre IS DISTINCT FROM a.efectivo_sistema
           OR a.otro_confirmado IS NOT NULL OR a.diferencia_otro IS NOT NULL
           OR a.monto_retirado IS DISTINCT FROM 0
           OR a.saldo_dejado_caja IS DISTINCT FROM a.efectivo_contado
           OR (a.snapshot_resumen IS NOT NULL AND COALESCE((a.snapshot_resumen->>'backfill_historico')::boolean, false) IS NOT TRUE)
      `, { transaction });

      const [[changedSnapshots]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*)::integer AS total
        FROM arqueo_movimientos_snapshot s
        LEFT JOIN movimientos_pago m ON m.id = s.movimiento_pago_id
        LEFT JOIN conceptos_cobro c ON c.id = m.concepto_cobro_id
        LEFT JOIN pacientes p ON p.id = c.paciente_id
        LEFT JOIN usuarios u ON u.id = m.usuario_receptor_id
        WHERE m.id IS NULL OR m.arqueo_id IS DISTINCT FROM s.arqueo_id
           OR s.fecha IS DISTINCT FROM m.fecha OR s.hora IS DISTINCT FROM m.hora
           OR s.paciente_id IS DISTINCT FROM c.paciente_id
           OR s.paciente_nombre_snapshot IS DISTINCT FROM COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.nombres, p.apellidos)), ''), 'Paciente no disponible')
           OR s.documento_snapshot IS DISTINCT FROM COALESCE(NULLIF(BTRIM(p.numero_documento), ''), NULLIF(BTRIM(p.ci), ''))
           OR s.historia_clinica_id IS DISTINCT FROM c.historia_clinica_id OR s.historia_snapshot IS NOT NULL
           OR s.concepto_snapshot IS DISTINCT FROM COALESCE(NULLIF(BTRIM(c.detalle), ''), NULLIF(BTRIM(c.tipo), ''), 'Concepto no disponible')
           OR s.metodo_snapshot IS DISTINCT FROM m.metodo OR s.monto_snapshot IS DISTINCT FROM m.monto
           OR s.estado_snapshot IS DISTINCT FROM m.estado OR s.recibido_por_id IS DISTINCT FROM m.usuario_receptor_id
           OR s.recibido_por_snapshot IS DISTINCT FROM u.nombre
      `, { transaction });

      if (Number(professional.total) > 0 || Number(changedSnapshots.total) > 0) {
        throw new Error('No se puede revertir la migracion porque existen arqueos que utilizan la nueva estructura profesional.');
      }

      await queryInterface.dropTable('arqueo_movimientos_snapshot', { transaction });
      await queryInterface.sequelize.query(
        'ALTER TABLE arqueos_pago DROP CONSTRAINT IF EXISTS arqueos_pago_efectivo_contado_no_negativo',
        { transaction }
      );
      for (const column of [
        'snapshot_resumen', 'resultado_cierre', 'saldo_dejado_caja', 'monto_retirado',
        'diferencia_otro', 'diferencia_tarjeta', 'diferencia_transferencia', 'diferencia_qr',
        'diferencia_efectivo', 'otro_confirmado', 'otro_sistema', 'efectivo_esperado_cierre',
        'saldo_inicial_definido_en', 'saldo_inicial_definido_por_id', 'saldo_inicial_manual',
        'saldo_inicial_origen_arqueo_id', 'saldo_inicial_efectivo', 'fecha_operativa', 'numero_arqueo'
      ]) await queryInterface.removeColumn('arqueos_pago', column, { transaction });
    });
  }
};
