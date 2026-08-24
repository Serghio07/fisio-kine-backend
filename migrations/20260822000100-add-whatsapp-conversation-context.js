'use strict';

const TABLE = 'whatsapp_conversaciones';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable(TABLE, { transaction });
      if (!columns.paciente_id || !columns.paso_actual || !columns.telefono) throw new Error(`Migración abortada: ${TABLE} no tiene la estructura esperada.`);
      await queryInterface.addColumn(TABLE, 'contacto_id', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'contactos', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' }, { transaction });
      await queryInterface.addColumn(TABLE, 'paciente_contexto_id', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'pacientes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' }, { transaction });
      await queryInterface.addColumn(TABLE, 'contexto_estado', { type: Sequelize.STRING(30), allowNull: true }, { transaction });
      await queryInterface.addColumn(TABLE, 'contexto_seleccionado_en', { type: Sequelize.DATE, allowNull: true }, { transaction });
      await queryInterface.addColumn(TABLE, 'contexto_origen', { type: Sequelize.STRING(40), allowNull: true }, { transaction });

      await queryInterface.sequelize.query(`
        WITH opciones AS (
          SELECT c.id AS conversacion_id, COUNT(DISTINCT x.paciente_id)::integer AS total
          FROM ${TABLE} c
          LEFT JOIN LATERAL (
            SELECT p.id AS paciente_id FROM pacientes p
            WHERE p.telefono_normalizado = c.telefono AND p.estado = TRUE
            UNION
            SELECT pc.paciente_id FROM contactos ct
            JOIN paciente_contactos pc ON pc.contacto_id = ct.id
              AND pc.estado = TRUE AND pc.fecha_fin IS NULL
              AND pc.autoriza_whatsapp = TRUE AND pc.puede_gestionar_citas = TRUE
            JOIN pacientes p ON p.id = pc.paciente_id AND p.estado = TRUE
            WHERE ct.telefono_normalizado = c.telefono AND ct.estado = TRUE
          ) x ON TRUE
          GROUP BY c.id
        )
        UPDATE ${TABLE} c SET
          paciente_contexto_id = CASE WHEN c.paciente_id IS NOT NULL AND o.total = 1 THEN c.paciente_id ELSE NULL END,
          contexto_estado = CASE WHEN c.paciente_id IS NULL THEN 'SIN_SELECCION' WHEN o.total = 1 THEN 'SELECCIONADO' ELSE 'SELECCION_REQUERIDA' END,
          contexto_seleccionado_en = CASE WHEN c.paciente_id IS NOT NULL AND o.total = 1 THEN COALESCE(c.updated_at, c.ultimo_mensaje_en) ELSE NULL END,
          contexto_origen = CASE WHEN c.paciente_id IS NOT NULL AND o.total = 1 THEN 'LEGACY_BACKFILL' ELSE NULL END,
          paso_actual = CASE WHEN c.paciente_id IS NOT NULL AND o.total <> 1 THEN 'ESPERANDO_SELECCION_PACIENTE' ELSE c.paso_actual END
        FROM opciones o WHERE o.conversacion_id = c.id
      `, { transaction });
      await queryInterface.changeColumn(TABLE, 'contexto_estado', { type: Sequelize.STRING(30), allowNull: false }, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE}
          DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check,
          ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (
            'ESPERANDO_SELECCION_PACIENTE','ESPERANDO_OPCION','INICIO_AGENDAR_CITA','INICIO_CONSULTAR_CITAS','INICIO_REPROGRAMAR_CANCELAR','INICIO_INFORMACION_CENTRO','DERIVACION_RECEPCION','ESPERANDO_NOMBRE','ESPERANDO_MOTIVO','ESPERANDO_FECHA_PREFERIDA','ESPERANDO_TURNO_PREFERIDO','ESPERANDO_HORA_PREFERIDA','ESPERANDO_CONFIRMACION_SOLICITUD','ESPERANDO_CAMPO_A_MODIFICAR','SOLICITUD_CREADA','BUSCANDO_DISPONIBILIDAD','ESPERANDO_SELECCION_HORARIO','SIN_DISPONIBILIDAD','ESPERANDO_NUEVA_FECHA','HORARIO_SELECCIONADO','ESPERANDO_CONFIRMACION_FINAL','CITA_CREADA','DERIVADA_RECEPCION','ESPERANDO_SELECCION_CITA','MOSTRANDO_DETALLE_CITA','ESPERANDO_ACCION_CITA','ESPERANDO_CONFIRMACION_CANCELACION','ESPERANDO_FECHA_REPROGRAMACION','ESPERANDO_HORARIO_REPROGRAMACION','ESPERANDO_CONFIRMACION_REPROGRAMACION','CITA_CANCELADA','CITA_REPROGRAMADA','ESPERANDO_RESPUESTA_RECORDATORIO','ESPERANDO_CONFIRMACION_NO_ASISTIRA','ASISTENCIA_CONFIRMADA','RECORDATORIO_DERIVADO_RECEPCION'
          )),
          ADD CONSTRAINT whatsapp_conversaciones_contexto_estado_check CHECK (contexto_estado IN ('SIN_SELECCION','SELECCION_REQUERIDA','SELECCIONADO')),
          ADD CONSTRAINT whatsapp_conversaciones_contexto_origen_check CHECK (contexto_origen IS NULL OR contexto_origen IN ('AUTO_UNICO','SELECCION_USUARIO','RECORDATORIO_REFERENCIADO','LEGACY_BACKFILL')),
          ADD CONSTRAINT whatsapp_conversaciones_contexto_integridad_check CHECK (
            (contexto_estado = 'SELECCIONADO' AND paciente_contexto_id IS NOT NULL AND contexto_seleccionado_en IS NOT NULL AND contexto_origen IS NOT NULL)
            OR (contexto_estado IN ('SIN_SELECCION','SELECCION_REQUERIDA') AND paciente_contexto_id IS NULL AND contexto_seleccionado_en IS NULL AND contexto_origen IS NULL)
          ),
          ADD CONSTRAINT whatsapp_conversaciones_paciente_contexto_legacy_check CHECK (
            paciente_id IS NULL OR paciente_contexto_id IS NULL OR paciente_id = paciente_contexto_id
          )
      `, { transaction });
      await queryInterface.addIndex(TABLE, ['contacto_id'], { name: 'whatsapp_conversaciones_contacto_idx', transaction });
      await queryInterface.addIndex(TABLE, ['paciente_contexto_id'], { name: 'whatsapp_conversaciones_paciente_contexto_idx', transaction });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(`SELECT count(*)::integer AS total FROM ${TABLE} WHERE contacto_id IS NOT NULL OR (paciente_contexto_id IS NOT NULL AND paciente_id IS DISTINCT FROM paciente_contexto_id)`, { transaction });
      if (Number(rows[0].total) > 0) throw new Error(`Rollback abortado: existen ${rows[0].total} conversaciones con contexto no representable por el esquema anterior.`);
      await queryInterface.removeIndex(TABLE, 'whatsapp_conversaciones_paciente_contexto_idx', { transaction });
      await queryInterface.removeIndex(TABLE, 'whatsapp_conversaciones_contacto_idx', { transaction });
      await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paciente_contexto_legacy_check, DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_contexto_integridad_check, DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_contexto_origen_check, DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_contexto_estado_check, DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check`, { transaction });
      const [waiting] = await queryInterface.sequelize.query(`SELECT count(*)::integer AS total FROM ${TABLE} WHERE paso_actual = 'ESPERANDO_SELECCION_PACIENTE'`, { transaction });
      if (Number(waiting[0].total) > 0) throw new Error(`Rollback abortado: existen ${waiting[0].total} conversaciones esperando selección de paciente.`);
      await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN ('ESPERANDO_OPCION','INICIO_AGENDAR_CITA','INICIO_CONSULTAR_CITAS','INICIO_REPROGRAMAR_CANCELAR','INICIO_INFORMACION_CENTRO','DERIVACION_RECEPCION','ESPERANDO_NOMBRE','ESPERANDO_MOTIVO','ESPERANDO_FECHA_PREFERIDA','ESPERANDO_TURNO_PREFERIDO','ESPERANDO_HORA_PREFERIDA','ESPERANDO_CONFIRMACION_SOLICITUD','ESPERANDO_CAMPO_A_MODIFICAR','SOLICITUD_CREADA','BUSCANDO_DISPONIBILIDAD','ESPERANDO_SELECCION_HORARIO','SIN_DISPONIBILIDAD','ESPERANDO_NUEVA_FECHA','HORARIO_SELECCIONADO','ESPERANDO_CONFIRMACION_FINAL','CITA_CREADA','DERIVADA_RECEPCION','ESPERANDO_SELECCION_CITA','MOSTRANDO_DETALLE_CITA','ESPERANDO_ACCION_CITA','ESPERANDO_CONFIRMACION_CANCELACION','ESPERANDO_FECHA_REPROGRAMACION','ESPERANDO_HORARIO_REPROGRAMACION','ESPERANDO_CONFIRMACION_REPROGRAMACION','CITA_CANCELADA','CITA_REPROGRAMADA','ESPERANDO_RESPUESTA_RECORDATORIO','ESPERANDO_CONFIRMACION_NO_ASISTIRA','ASISTENCIA_CONFIRMADA','RECORDATORIO_DERIVADO_RECEPCION'))`, { transaction });
      for (const column of ['contexto_origen','contexto_seleccionado_en','contexto_estado','paciente_contexto_id','contacto_id']) await queryInterface.removeColumn(TABLE, column, { transaction });
    });
  }
};
