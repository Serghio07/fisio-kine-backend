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
Usuario.hasMany(Sesion, { foreignKey: 'usuario_id', as: 'sesiones_registradas', onDelete: 'SET NULL' });
Sesion.belongsTo(Usuario, { foreignKey: 'usuario_id', as: 'registrado_por' });

Paciente.hasMany(InformeMedico, { foreignKey: 'paciente_id', as: 'informes_medicos', onDelete: 'CASCADE' });
InformeMedico.belongsTo(Paciente, { foreignKey: 'paciente_id', as: 'paciente' });

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
  PlanillaPersonalDetalle
};
