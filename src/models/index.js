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
  PlanillaSesion
};
