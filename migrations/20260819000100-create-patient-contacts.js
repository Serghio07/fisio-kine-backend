'use strict';

const DOCUMENT_TYPES = ['CI', 'DNI', 'PASAPORTE', 'CEDULA', 'CARNET_EXTRANJERIA', 'OTRO'];
const RELATIONSHIP_TYPES = [
  'PADRE', 'MADRE', 'TUTOR_LEGAL', 'ABUELO', 'ABUELA',
  'HERMANO', 'HERMANA', 'CUIDADOR', 'APODERADO', 'OTRO'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('contactos', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        nombres: { type: Sequelize.STRING(150), allowNull: false },
        apellidos: { type: Sequelize.STRING(150), allowNull: false },
        telefono: { type: Sequelize.STRING(30), allowNull: false },
        telefono_normalizado: { type: Sequelize.STRING(15), allowNull: false },
        tipo_documento: { type: Sequelize.STRING(30), allowNull: true },
        numero_documento: { type: Sequelize.STRING(50), allowNull: true },
        numero_documento_normalizado: { type: Sequelize.STRING(50), allowNull: true },
        nombre_documento_otro: { type: Sequelize.STRING(100), allowNull: true },
        paciente_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'pacientes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        estado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE contactos
        ADD CONSTRAINT contactos_telefono_normalizado_check
          CHECK (telefono_normalizado ~ '^[0-9]{7,15}$'),
        ADD CONSTRAINT contactos_tipo_documento_check
          CHECK (tipo_documento IS NULL OR tipo_documento IN (${DOCUMENT_TYPES.map((value) => `'${value}'`).join(',')})),
        ADD CONSTRAINT contactos_documento_consistencia_check
          CHECK ((tipo_documento IS NULL AND numero_documento IS NULL AND numero_documento_normalizado IS NULL)
              OR (tipo_documento IS NOT NULL AND numero_documento IS NOT NULL AND numero_documento_normalizado IS NOT NULL)),
        ADD CONSTRAINT contactos_documento_otro_check
          CHECK (tipo_documento <> 'OTRO' OR (nombre_documento_otro IS NOT NULL AND BTRIM(nombre_documento_otro) <> ''))
      `, { transaction });

      await queryInterface.addIndex('contactos', ['telefono_normalizado'], {
        name: 'contactos_telefono_normalizado_idx', transaction
      });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX contactos_paciente_id_unique
        ON contactos (paciente_id)
        WHERE paciente_id IS NOT NULL
      `, { transaction });

      await queryInterface.createTable('paciente_contactos', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        paciente_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'pacientes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        contacto_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'contactos', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },
        parentesco: { type: Sequelize.STRING(30), allowNull: false },
        parentesco_otro: { type: Sequelize.STRING(100), allowNull: true },
        es_contacto_principal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        es_responsable_legal: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        recibe_recordatorios: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        puede_gestionar_citas: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        autoriza_whatsapp: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        prioridad: { type: Sequelize.SMALLINT, allowNull: false, defaultValue: 1 },
        estado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        fecha_inicio: { type: Sequelize.DATEONLY, allowNull: false, defaultValue: Sequelize.literal('CURRENT_DATE') },
        fecha_fin: { type: Sequelize.DATEONLY, allowNull: true },
        observaciones: { type: Sequelize.TEXT, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      }, { transaction });

      await queryInterface.sequelize.query(`
        ALTER TABLE paciente_contactos
        ADD CONSTRAINT paciente_contactos_parentesco_check
          CHECK (parentesco IN (${RELATIONSHIP_TYPES.map((value) => `'${value}'`).join(',')})),
        ADD CONSTRAINT paciente_contactos_parentesco_otro_check
          CHECK (parentesco <> 'OTRO' OR (parentesco_otro IS NOT NULL AND BTRIM(parentesco_otro) <> '')),
        ADD CONSTRAINT paciente_contactos_prioridad_check
          CHECK (prioridad > 0),
        ADD CONSTRAINT paciente_contactos_fechas_check
          CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
        ADD CONSTRAINT paciente_contactos_estado_vigencia_check
          CHECK ((estado = TRUE AND fecha_fin IS NULL) OR (estado = FALSE AND fecha_fin IS NOT NULL))
      `, { transaction });

      await queryInterface.addIndex('paciente_contactos', ['paciente_id'], {
        name: 'paciente_contactos_paciente_idx', transaction
      });
      await queryInterface.addIndex('paciente_contactos', ['contacto_id'], {
        name: 'paciente_contactos_contacto_idx', transaction
      });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX paciente_contactos_activo_unique
        ON paciente_contactos (paciente_id, contacto_id)
        WHERE estado = TRUE AND fecha_fin IS NULL
      `, { transaction });
      await queryInterface.sequelize.query(`
        CREATE UNIQUE INDEX paciente_contactos_principal_activo_unique
        ON paciente_contactos (paciente_id)
        WHERE es_contacto_principal = TRUE AND estado = TRUE AND fecha_fin IS NULL
      `, { transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.dropTable('paciente_contactos', { transaction });
      await queryInterface.dropTable('contactos', { transaction });
    });
  }
};
