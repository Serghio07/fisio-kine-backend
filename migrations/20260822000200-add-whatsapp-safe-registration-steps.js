'use strict';

const TABLE = 'whatsapp_conversaciones';
const NEW_STEPS = [
  'ESPERANDO_TIPO_PACIENTE','ESPERANDO_NOMBRE_NUEVO_PACIENTE','ESPERANDO_FECHA_NACIMIENTO',
  'ESPERANDO_DATOS_TUTOR','ESPERANDO_PARENTESCO_TUTOR','ESPERANDO_CONFIRMACION_NUEVO_PACIENTE',
  'ESPERANDO_SELECCION_RECORDATORIO'
];
const PREVIOUS_STEPS = [
  'ESPERANDO_SELECCION_PACIENTE','ESPERANDO_OPCION','INICIO_AGENDAR_CITA','INICIO_CONSULTAR_CITAS','INICIO_REPROGRAMAR_CANCELAR','INICIO_INFORMACION_CENTRO','DERIVACION_RECEPCION','ESPERANDO_NOMBRE','ESPERANDO_MOTIVO','ESPERANDO_FECHA_PREFERIDA','ESPERANDO_TURNO_PREFERIDO','ESPERANDO_HORA_PREFERIDA','ESPERANDO_CONFIRMACION_SOLICITUD','ESPERANDO_CAMPO_A_MODIFICAR','SOLICITUD_CREADA','BUSCANDO_DISPONIBILIDAD','ESPERANDO_SELECCION_HORARIO','SIN_DISPONIBILIDAD','ESPERANDO_NUEVA_FECHA','HORARIO_SELECCIONADO','ESPERANDO_CONFIRMACION_FINAL','CITA_CREADA','DERIVADA_RECEPCION','ESPERANDO_SELECCION_CITA','MOSTRANDO_DETALLE_CITA','ESPERANDO_ACCION_CITA','ESPERANDO_CONFIRMACION_CANCELACION','ESPERANDO_FECHA_REPROGRAMACION','ESPERANDO_HORARIO_REPROGRAMACION','ESPERANDO_CONFIRMACION_REPROGRAMACION','CITA_CANCELADA','CITA_REPROGRAMADA','ESPERANDO_RESPUESTA_RECORDATORIO','ESPERANDO_CONFIRMACION_NO_ASISTIRA','ASISTENCIA_CONFIRMADA','RECORDATORIO_DERIVADO_RECEPCION'
];
const quoted = (values) => values.map((value) => `'${value}'`).join(',');

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check, ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (${quoted([...PREVIOUS_STEPS, ...NEW_STEPS])}))`, { transaction });
    });
  },
  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const [rows] = await queryInterface.sequelize.query(`SELECT count(*)::integer AS total FROM ${TABLE} WHERE paso_actual IN (${quoted(NEW_STEPS)})`, { transaction });
      if (Number(rows[0].total) > 0) throw new Error(`Rollback abortado: existen ${rows[0].total} conversaciones en estados exclusivos de Fase 6C.`);
      await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS whatsapp_conversaciones_paso_check, ADD CONSTRAINT whatsapp_conversaciones_paso_check CHECK (paso_actual IN (${quoted(PREVIOUS_STEPS)}))`, { transaction });
    });
  }
};

module.exports.NEW_STEPS = NEW_STEPS;
