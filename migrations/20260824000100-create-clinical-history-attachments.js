'use strict';

const TYPES = ['RADIOGRAFIA', 'LABORATORIO', 'RESONANCIA', 'TOMOGRAFIA', 'ECOGRAFIA', 'INFORME_OTRA_CLINICA', 'RECETA_MEDICA', 'CERTIFICADO_MEDICO', 'OTRO'];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('adjuntos_historia_clinica', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        paciente_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pacientes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        historia_clinica_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'historias_clinicas', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        sesion_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'sesiones', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        tipo_adjunto: { type: Sequelize.STRING(40), allowNull: false },
        titulo: { type: Sequelize.STRING(180), allowNull: false },
        descripcion: { type: Sequelize.TEXT, allowNull: true },
        fecha_documento: { type: Sequelize.DATEONLY, allowNull: true },
        archivo: { type: Sequelize.STRING(255), allowNull: false },
        nombre_archivo_original: { type: Sequelize.STRING(255), allowNull: false },
        mime_type: { type: Sequelize.STRING(80), allowNull: false },
        tamano_bytes: { type: Sequelize.BIGINT, allowNull: false },
        creado_por_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
        activo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        eliminado: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        fecha_eliminacion: { type: Sequelize.DATE, allowNull: true },
        eliminado_por_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'usuarios', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction });
      await queryInterface.addConstraint('adjuntos_historia_clinica', { fields: ['tipo_adjunto'], type: 'check', name: 'adjuntos_historia_tipo_check', where: { tipo_adjunto: TYPES }, transaction });
      await queryInterface.addConstraint('adjuntos_historia_clinica', { fields: ['tamano_bytes'], type: 'check', name: 'adjuntos_historia_tamano_check', where: { tamano_bytes: { [Sequelize.Op.gt]: 0 } }, transaction });
      await queryInterface.addIndex('adjuntos_historia_clinica', ['historia_clinica_id', 'activo', 'created_at'], { name: 'adjuntos_historia_historia_activo_fecha_idx', transaction });
      await queryInterface.addIndex('adjuntos_historia_clinica', ['paciente_id', 'historia_clinica_id'], { name: 'adjuntos_historia_paciente_historia_idx', transaction });
      await queryInterface.addIndex('adjuntos_historia_clinica', ['sesion_id'], { name: 'adjuntos_historia_sesion_idx', transaction });
      await queryInterface.addIndex('adjuntos_historia_clinica', ['tipo_adjunto'], { name: 'adjuntos_historia_tipo_idx', transaction });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query('SELECT COUNT(*)::integer AS total FROM adjuntos_historia_clinica', { transaction });
      if (Number(rows[0]?.total || 0) > 0) throw new Error('Rollback bloqueado: adjuntos_historia_clinica contiene registros. Respalde y retire los adjuntos explícitamente antes de continuar.');
      await queryInterface.dropTable('adjuntos_historia_clinica', { transaction });
    });
  }
};
