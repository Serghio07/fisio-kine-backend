'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        ALTER TABLE notificaciones_internas
        DROP CONSTRAINT IF EXISTS notificaciones_internas_referencia_check,
        DROP CONSTRAINT IF EXISTS notificaciones_internas_entidad_check,
        DROP CONSTRAINT IF EXISTS notificaciones_internas_tipo_check
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE notificaciones_internas
        ADD CONSTRAINT notificaciones_internas_tipo_check
          CHECK (tipo IN ('NUEVA_DERIVACION','DERIVACION_ASIGNADA','RESPUESTA_PACIENTE','ENVIO_WHATSAPP_FALLIDO','DERIVACION_PENDIENTE_VENCIDA','CITA_PROXIMA')),
        ADD CONSTRAINT notificaciones_internas_entidad_check
          CHECK (entidad_tipo IN ('DERIVACION_WHATSAPP','RESPUESTA_RECEPCION_WHATSAPP','CITA_AGENDA')),
        ADD CONSTRAINT notificaciones_internas_referencia_check CHECK (
          (entidad_tipo='DERIVACION_WHATSAPP' AND derivacion_id IS NOT NULL AND entidad_id=derivacion_id)
          OR (entidad_tipo='RESPUESTA_RECEPCION_WHATSAPP' AND respuesta_recepcion_id IS NOT NULL AND derivacion_id IS NOT NULL AND entidad_id=respuesta_recepcion_id)
          OR (entidad_tipo='CITA_AGENDA' AND derivacion_id IS NULL AND respuesta_recepcion_id IS NULL)
        )
      `, { transaction });
    });
  },

  async down(queryInterface) {
    const [[usage]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*)::integer AS count FROM notificaciones_internas
      WHERE tipo='CITA_PROXIMA' OR entidad_tipo='CITA_AGENDA'
    `);
    if (Number(usage.count) > 0) throw new Error('No se puede revertir: existen notificaciones de citas.');
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`
        ALTER TABLE notificaciones_internas
        DROP CONSTRAINT IF EXISTS notificaciones_internas_referencia_check,
        DROP CONSTRAINT IF EXISTS notificaciones_internas_entidad_check,
        DROP CONSTRAINT IF EXISTS notificaciones_internas_tipo_check
      `, { transaction });
      await queryInterface.sequelize.query(`
        ALTER TABLE notificaciones_internas
        ADD CONSTRAINT notificaciones_internas_tipo_check
          CHECK (tipo IN ('NUEVA_DERIVACION','DERIVACION_ASIGNADA','RESPUESTA_PACIENTE','ENVIO_WHATSAPP_FALLIDO','DERIVACION_PENDIENTE_VENCIDA')),
        ADD CONSTRAINT notificaciones_internas_entidad_check
          CHECK (entidad_tipo IN ('DERIVACION_WHATSAPP','RESPUESTA_RECEPCION_WHATSAPP')),
        ADD CONSTRAINT notificaciones_internas_referencia_check CHECK (
          (entidad_tipo='DERIVACION_WHATSAPP' AND derivacion_id IS NOT NULL AND entidad_id=derivacion_id)
          OR (entidad_tipo='RESPUESTA_RECEPCION_WHATSAPP' AND respuesta_recepcion_id IS NOT NULL AND derivacion_id IS NOT NULL AND entidad_id=respuesta_recepcion_id)
        )
      `, { transaction });
    });
  }
};
