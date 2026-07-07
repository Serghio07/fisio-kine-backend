const sequelize = require('../config/database');
const Usuario = require('./Usuario');
const Paciente = require('./Paciente');
const HistoriaClinica = require('./HistoriaClinica');
const AntecedentePersonal = require('./AntecedentePersonal');
const AntecedenteFamiliar = require('./AntecedenteFamiliar');
const ExamenKinesico = require('./ExamenKinesico');
const CondicionActual = require('./CondicionActual');
const IntervencionClinica = require('./IntervencionClinica');
const EvaluacionFinal = require('./EvaluacionFinal');
const Sesion = require('./Sesion');
const InformeMedico = require('./InformeMedico');
const RegistroSemanal = require('./RegistroSemanal');
const PlanillaAtencion = require('./PlanillaAtencion');
const PlanillaSesion = require('./PlanillaSesion');
const { Cita, ESTADOS_CITA, TIPOS_ATENCION } = require('./Cita');
const Personal = require('./Personal');
const PlanillaPersonal = require('./PlanillaPersonal');
const PlanillaPersonalDetalle = require('./PlanillaPersonalDetalle');
const TareaPersonal = require('./TareaPersonal');
const ActividadSistema = require('./ActividadSistema');
const DocumentoClinico = require('./DocumentoClinico');
const PagoClinico = require('./PagoClinico');

Paciente.hasMany(HistoriaClinica, { foreignKey: 'paciente_id', as: 'historias_clinicas', onDelete: 'CASCADE' });
HistoriaClinica.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

Usuario.hasMany(HistoriaClinica, { foreignKey: 'usuario_id', as: 'historias_registradas', onDelete: 'SET NULL' });
HistoriaClinica.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

HistoriaClinica.hasOne(AntecedentePersonal, { foreignKey: 'historia_clinica_id', as: 'antecedente_personal', onDelete: 'CASCADE' });
AntecedentePersonal.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

HistoriaClinica.hasOne(AntecedenteFamiliar, { foreignKey: 'historia_clinica_id', as: 'antecedente_familiar', onDelete: 'CASCADE' });
AntecedenteFamiliar.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

HistoriaClinica.hasOne(ExamenKinesico, { foreignKey: 'historia_clinica_id', as: 'examen_kinesico', onDelete: 'CASCADE' });
ExamenKinesico.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

HistoriaClinica.hasOne(CondicionActual, { foreignKey: 'historia_clinica_id', as: 'condicion_actual', onDelete: 'CASCADE' });
CondicionActual.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

HistoriaClinica.hasOne(IntervencionClinica, { foreignKey: 'historia_clinica_id', as: 'intervencion_clinica', onDelete: 'CASCADE' });
IntervencionClinica.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

HistoriaClinica.hasOne(EvaluacionFinal, { foreignKey: 'historia_clinica_id', as: 'evaluacion_final', onDelete: 'CASCADE' });
EvaluacionFinal.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id' });

Paciente.hasMany(Sesion, { foreignKey: 'paciente_id', as: 'sesiones', onDelete: 'CASCADE' });
Sesion.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });
HistoriaClinica.hasMany(Sesion, { foreignKey: 'historia_clinica_id', as: 'sesiones', onDelete: 'SET NULL' });
Sesion.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id', as: 'historia_clinica' });
Usuario.hasMany(Sesion, { foreignKey: 'usuario_id', as: 'sesiones_registradas', onDelete: 'SET NULL' });
Sesion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'registrado_por' });

Paciente.hasMany(InformeMedico, { foreignKey: 'paciente_id', as: 'informes_medicos', onDelete: 'CASCADE' });
InformeMedico.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });
HistoriaClinica.hasMany(InformeMedico, { foreignKey: 'historia_clinica_id', as: 'informes_medicos', onDelete: 'RESTRICT' });
InformeMedico.belongsTo(HistoriaClinica, { foreignKey: 'historia_clinica_id', as: 'historia_clinica' });

Paciente.hasMany(RegistroSemanal, { foreignKey: 'paciente_id', as: 'registros_semanales', onDelete: 'CASCADE' });
RegistroSemanal.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

Paciente.hasMany(PlanillaAtencion, { foreignKey: 'paciente_id', as: 'planillas_atencion', onDelete: 'CASCADE' });
PlanillaAtencion.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

PlanillaAtencion.hasMany(PlanillaSesion, { foreignKey: 'planilla_id', as: 'sesiones', onDelete: 'CASCADE' });
PlanillaSesion.belongsTo(PlanillaAtencion, { foreignKey: 'planilla_id', as: 'planilla' });

Paciente.hasMany(PlanillaSesion, { foreignKey: 'paciente_id', as: 'planilla_sesiones', onDelete: 'CASCADE' });
PlanillaSesion.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

Paciente.hasMany(Cita, { foreignKey: 'paciente_id', as: 'citas', onDelete: 'RESTRICT' });
Cita.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });
Usuario.hasMany(Cita, { foreignKey: 'usuario_id', as: 'citas_registradas', onDelete: 'SET NULL' });
Cita.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'registrado_por' });

Usuario.hasOne(Personal, { foreignKey: 'usuario_id', as: 'ficha_personal', onDelete: 'SET NULL' });
Personal.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });

Usuario.hasMany(PlanillaPersonal, { foreignKey: 'usuario_id', as: 'planillas_sueldos_creadas', onDelete: 'SET NULL' });
PlanillaPersonal.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'creado_por' });

PlanillaPersonal.hasMany(PlanillaPersonalDetalle, { foreignKey: 'planilla_id', as: 'detalles', onDelete: 'CASCADE' });
PlanillaPersonalDetalle.belongsTo(PlanillaPersonal, { foreignKey: 'planilla_id', as: 'planilla' });
Personal.hasMany(PlanillaPersonalDetalle, { foreignKey: 'personal_id', as: 'detalles_planilla', onDelete: 'SET NULL' });
PlanillaPersonalDetalle.belongsTo(Personal, { foreignKey: 'personal_id', as: 'personal' });

Personal.hasMany(TareaPersonal, { foreignKey: 'personal_id', as: 'tareas', onDelete: 'CASCADE' });
TareaPersonal.belongsTo(Personal, { foreignKey: 'personal_id', as: 'personal' });
Usuario.hasMany(TareaPersonal, { foreignKey: 'usuario_id', as: 'tareas_creadas', onDelete: 'SET NULL' });
TareaPersonal.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'creado_por' });
Usuario.hasMany(TareaPersonal, { foreignKey: 'asignado_usuario_id', as: 'tareas_asignadas', onDelete: 'CASCADE' });
TareaPersonal.belongsTo(Usuario, { foreignKey: 'asignado_usuario_id', as: 'asignado_a' });
Paciente.hasMany(TareaPersonal, { foreignKey: 'paciente_id', as: 'tareas_extra', onDelete: 'CASCADE' });
TareaPersonal.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

Usuario.hasMany(ActividadSistema, { foreignKey: 'usuario_id', as: 'actividades', onDelete: 'CASCADE' });
ActividadSistema.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'usuario' });
Paciente.hasMany(ActividadSistema, { foreignKey: 'paciente_id', as: 'actividades', onDelete: 'SET NULL' });
ActividadSistema.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

Paciente.hasMany(DocumentoClinico, { foreignKey: 'paciente_id', as: 'documentos_clinicos', onDelete: 'CASCADE' });
DocumentoClinico.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });
Usuario.hasMany(DocumentoClinico, { foreignKey: 'usuario_id', as: 'documentos_creados', onDelete: 'SET NULL' });
DocumentoClinico.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'creado_por' });
Usuario.hasMany(DocumentoClinico, { foreignKey: 'usuario_modificacion_id', as: 'documentos_modificados', onDelete: 'SET NULL' });
DocumentoClinico.belongsTo(Usuario, { foreignKey: 'usuario_modificacion_id', as: 'modificado_por' });
Sesion.hasMany(DocumentoClinico, { foreignKey: 'sesion_id', as: 'documentos_clinicos', onDelete: 'SET NULL' });
DocumentoClinico.belongsTo(Sesion, { foreignKey: 'sesion_id', as: 'sesion' });

Paciente.hasMany(PagoClinico, { foreignKey: 'paciente_id', as: 'pagos_clinicos', onDelete: 'CASCADE' });
PagoClinico.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });
DocumentoClinico.hasOne(PagoClinico, { foreignKey: 'documento_id', as: 'pago', onDelete: 'CASCADE' });
PagoClinico.belongsTo(DocumentoClinico, { foreignKey: 'documento_id', as: 'documento' });
Usuario.hasMany(PagoClinico, { foreignKey: 'usuario_id', as: 'pagos_clinicos', onDelete: 'SET NULL' });
PagoClinico.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'registrado_por' });

module.exports = {
  sequelize,
  Usuario,
  Paciente,
  HistoriaClinica,
  AntecedentePersonal,
  AntecedenteFamiliar,
  ExamenKinesico,
  CondicionActual,
  IntervencionClinica,
  EvaluacionFinal,
  Sesion,
  InformeMedico,
  RegistroSemanal,
  PlanillaAtencion,
  PlanillaSesion,
  Cita,
  ESTADOS_CITA,
  TIPOS_ATENCION,
  Personal,
  PlanillaPersonal,
  PlanillaPersonalDetalle,
  TareaPersonal,
  ActividadSistema,
  DocumentoClinico,
  PagoClinico
};
