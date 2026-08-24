'use strict';

const TABLE = 'whatsapp_recordatorios_cita';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const columns = await queryInterface.describeTable(TABLE, { transaction });
      if (!columns.telefono_normalizado || !columns.estado) {
        throw new Error(`Migración abortada: ${TABLE} no tiene la estructura esperada.`);
      }

      await queryInterface.addColumn(TABLE, 'contacto_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'contactos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction });
      await queryInterface.addColumn(TABLE, 'telefono_fuente', {
        type: Sequelize.STRING(20), allowNull: true
      }, { transaction });
      await queryInterface.addColumn(TABLE, 'parentesco_snapshot', {
        type: Sequelize.STRING(100), allowNull: true
      }, { transaction });
      await queryInterface.addColumn(TABLE, 'destinatario_nombre_snapshot', {
        type: Sequelize.STRING(255), allowNull: true
      }, { transaction });

      await queryInterface.sequelize.query(`
        UPDATE ${TABLE}
        SET telefono_fuente = 'PACIENTE'
        WHERE telefono_fuente IS NULL
      `, { transaction });
      await queryInterface.changeColumn(TABLE, 'telefono_fuente', {
        type: Sequelize.STRING(20), allowNull: false
      }, { transaction });
      await queryInterface.changeColumn(TABLE, 'telefono_normalizado', {
        type: Sequelize.STRING(15), allowNull: true
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE}
          DROP CONSTRAINT IF EXISTS whatsapp_recordatorios_cita_estado_check,
          DROP CONSTRAINT IF EXISTS whatsapp_recordatorios_cita_telefono_check,
          ADD CONSTRAINT whatsapp_recordatorios_cita_estado_check CHECK (estado IN (
            'PENDIENTE', 'PROCESANDO', 'ACEPTADO', 'ENVIADO', 'ENTREGADO', 'LEIDO',
            'REINTENTO', 'FALLIDO', 'CANCELADO', 'RESPONDIDO', 'EXPIRADO', 'SIN_DESTINATARIO'
          )),
          ADD CONSTRAINT whatsapp_recordatorios_cita_fuente_check
            CHECK (telefono_fuente IN ('PACIENTE', 'CONTACTO')),
          ADD CONSTRAINT whatsapp_recordatorios_cita_destino_check CHECK (
            (estado = 'SIN_DESTINATARIO' AND telefono_normalizado IS NULL) OR
            (estado <> 'SIN_DESTINATARIO' AND telefono_normalizado IS NOT NULL
              AND telefono_normalizado ~ '^[0-9]{5,15}$')
          )
      `, { transaction });
      await queryInterface.addIndex(TABLE, ['contacto_id'], {
        name: 'whatsapp_recordatorios_cita_contacto_idx', transaction
      });
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(`
        SELECT count(*)::integer AS total
        FROM ${TABLE}
        WHERE estado = 'SIN_DESTINATARIO' OR telefono_normalizado IS NULL
      `, { transaction });
      if (Number(rows[0].total) > 0) {
        throw new Error(`Rollback abortado: existen ${rows[0].total} recordatorios sin destinatario.`);
      }

      await queryInterface.removeIndex(TABLE, 'whatsapp_recordatorios_cita_contacto_idx', { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE ${TABLE}
          DROP CONSTRAINT IF EXISTS whatsapp_recordatorios_cita_destino_check,
          DROP CONSTRAINT IF EXISTS whatsapp_recordatorios_cita_fuente_check,
          DROP CONSTRAINT IF EXISTS whatsapp_recordatorios_cita_estado_check,
          ADD CONSTRAINT whatsapp_recordatorios_cita_estado_check CHECK (estado IN (
            'PENDIENTE', 'PROCESANDO', 'ACEPTADO', 'ENVIADO', 'ENTREGADO', 'LEIDO',
            'REINTENTO', 'FALLIDO', 'CANCELADO', 'RESPONDIDO', 'EXPIRADO'
          )),
          ADD CONSTRAINT whatsapp_recordatorios_cita_telefono_check
            CHECK (telefono_normalizado ~ '^[0-9]{5,15}$')
      `, { transaction });
      await queryInterface.changeColumn(TABLE, 'telefono_normalizado', {
        type: Sequelize.STRING(15), allowNull: false
      }, { transaction });
      for (const column of ['destinatario_nombre_snapshot', 'parentesco_snapshot', 'telefono_fuente', 'contacto_id']) {
        await queryInterface.removeColumn(TABLE, column, { transaction });
      }
    });
  }
};
