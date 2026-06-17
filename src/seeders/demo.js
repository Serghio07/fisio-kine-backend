require('dotenv').config();

const {
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
  Cita
} = require('../models');

const usuarios = [
  {
    nombre: 'Dra. Mariana Vargas',
    usuario: 'mvargas',
    email: 'mariana.vargas@physioactive.local',
    password: 'Personal123',
    rol: 'personal',
    estado: 'activo'
  },
  {
    nombre: 'Lic. Daniel Rojas',
    usuario: 'drojas',
    email: 'daniel.rojas@physioactive.local',
    password: 'Personal123',
    rol: 'personal',
    estado: 'activo'
  },
  {
    nombre: 'Enf. Camila Salazar',
    usuario: 'csalazar',
    email: 'camila.salazar@physioactive.local',
    password: 'Personal123',
    rol: 'personal',
    estado: 'activo'
  }
];

const pacientes = [
  {
    nombres: 'Lucia Andrea',
    apellidos: 'Mendoza Rios',
    ci: '9102451',
    fecha_nacimiento: '1994-03-12',
    edad: 32,
    sexo: 'F',
    telefono: '72014588',
    domicilio: 'Av. America 1245',
    estado_civil: 'Soltero',
    ocupacion: 'Contadora',
    referencia: 'Dolor lumbar posterior a esfuerzo laboral.'
  },
  {
    nombres: 'Marco Antonio',
    apellidos: 'Gutierrez Paredes',
    ci: '8845120',
    fecha_nacimiento: '1987-08-26',
    edad: 38,
    sexo: 'M',
    telefono: '69501477',
    domicilio: 'Zona Cala Cala, calle 7',
    estado_civil: 'Casado',
    ocupacion: 'Chofer',
    referencia: 'Lesion de hombro derecho por sobreuso.'
  },
  {
    nombres: 'Valeria Sofia',
    apellidos: 'Quispe Arce',
    ci: '10234598',
    fecha_nacimiento: '2001-11-04',
    edad: 24,
    sexo: 'F',
    telefono: '76450321',
    domicilio: 'Barrio Universitario',
    estado_civil: 'Soltero',
    ocupacion: 'Estudiante',
    referencia: 'Esguince de tobillo izquierdo grado I.'
  },
  {
    nombres: 'Jorge Luis',
    apellidos: 'Camacho Flores',
    ci: '7563189',
    fecha_nacimiento: '1979-06-18',
    edad: 47,
    sexo: 'M',
    telefono: '60789214',
    domicilio: 'Av. Blanco Galindo km 5',
    estado_civil: 'Casado',
    ocupacion: 'Comerciante',
    referencia: 'Dolor cervical recurrente con contractura muscular.'
  }
];

const addDays = (date, days) => {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};

async function ensureUsuarios() {
  const created = [];
  for (const item of usuarios) {
    const [usuario] = await Usuario.findOrCreate({
      where: { usuario: item.usuario },
      defaults: item
    });
    created.push(usuario);
  }
  return created;
}

async function ensureHistoria(paciente, usuario, index) {
  const exists = await HistoriaClinica.findOne({ where: { paciente_id: paciente.id } });
  if (exists) return exists;

  const historia = await HistoriaClinica.create({
    paciente_id: paciente.id,
    usuario_id: usuario?.id || null,
    fecha_evaluacion: addDays('2026-06-10', index),
    lugar_fecha_nacimiento: 'Cochabamba, Bolivia',
    peso: 62 + index * 5,
    talla: 1.58 + index * 0.04,
    imc: 24.3,
    diagnostico_medico: paciente.referencia,
    motivo_consulta: 'Dolor y limitacion funcional durante actividades cotidianas.',
    enfermedad_actual: 'Cuadro de evolucion reciente, sin signos de alarma, con respuesta parcial al reposo.',
    profesional_cargo: usuario?.nombre || 'Profesional de turno',
    estado: 'activa'
  });

  await AntecedentePersonal.create({
    historia_clinica_id: historia.id,
    patologicos: index % 2 === 0,
    traumaticos: true,
    detalle_patologicos: index % 2 === 0 ? 'Antecedente de dolor recurrente.' : '',
    detalle_traumaticos: 'Refiere episodio mecanico asociado al inicio del dolor.',
    observaciones: 'Sin alergias conocidas al momento de la evaluacion.'
  });

  await AntecedenteFamiliar.create({
    historia_clinica_id: historia.id,
    hipertension: index % 2 === 1,
    diabetes: index === 2,
    otros: 'Sin otros antecedentes familiares relevantes.'
  });

  await ExamenKinesico.create({
    historia_clinica_id: historia.id,
    observacion: 'Paciente colaborador, marcha funcional conservada.',
    inspeccion: 'Leve compensacion postural durante la evaluacion.',
    palpacion: 'Dolor localizado y aumento de tono muscular.',
    pruebas_especificas: 'Pruebas funcionales compatibles con el diagnostico inicial.'
  });

  await CondicionActual.create({
    historia_clinica_id: historia.id,
    tipo_lesion: ['M', 'S', 'T', 'PF'][index],
    zona_cuerpo: ['Lumbar', 'Hombro derecho', 'Tobillo izquierdo', 'Cervical'][index],
    estudios_imagenologicos: 'No presenta estudios recientes al momento de la evaluacion.',
    descripcion: 'Limitacion funcional leve a moderada con dolor mecanico.'
  });

  await IntervencionClinica.create({
    historia_clinica_id: historia.id,
    escala_dolor: [6, 5, 4, 7][index],
    tono: 'Aumento de tono en musculatura relacionada.',
    goniometria_balance_articular: 'Rango articular disminuido en los ultimos grados.',
    balance_muscular: 'Fuerza conservada con fatiga al esfuerzo sostenido.',
    trofismo: 'Conservado',
    detalle_trofismo: 'Sin alteraciones visibles.',
    observaciones: 'Se indica plan fisioterapeutico progresivo.'
  });

  await EvaluacionFinal.create({
    historia_clinica_id: historia.id,
    evaluacion_postura: 'Postura funcional con compensaciones leves.',
    evaluacion_marcha: 'Marcha independiente sin ayuda tecnica.',
    diagnostico_kinesico_cif: 'Alteracion funcional asociada a dolor musculoesqueletico.',
    plan_tratamiento: 'Terapia manual, movilidad, fortalecimiento y educacion del paciente.',
    periodicidad: '3 veces por semana',
    profesional_cargo: usuario?.nombre || 'Profesional de turno'
  });

  return historia;
}

async function ensureSesiones(paciente, index) {
  const count = await Sesion.count({ where: { paciente_id: paciente.id } });
  if (count > 0) return;

  const baseDate = addDays('2026-06-17', index * 2);
  await Sesion.bulkCreate([
    {
      paciente_id: paciente.id,
      fecha: baseDate,
      numero_sesion: 1,
      sesiones_debe: 10,
      sesiones_hizo: 1,
      asistencia: 'asistio',
      metodo_pago: 'Efectivo',
      observacion: 'Sesion inicial de evaluacion y analgesia.'
    },
    {
      paciente_id: paciente.id,
      fecha: addDays(baseDate, 2),
      numero_sesion: 2,
      sesiones_debe: 10,
      sesiones_hizo: 2,
      asistencia: 'asistio',
      metodo_pago: 'QR',
      observacion: 'Trabajo de movilidad y control de dolor.'
    },
    {
      paciente_id: paciente.id,
      fecha: addDays(baseDate, 4),
      numero_sesion: 3,
      sesiones_debe: 10,
      sesiones_hizo: 3,
      asistencia: 'pendiente',
      metodo_pago: 'Pendiente',
      observacion: 'Sesion programada.'
    }
  ]);
}

async function ensureCitas(paciente, index) {
  const count = await Cita.count({ where: { paciente_id: paciente.id } });
  if (count > 0) return;

  const baseDate = addDays('2026-06-18', index);
  await Cita.bulkCreate([
    {
      paciente_id: paciente.id,
      fecha: baseDate,
      hora_inicio: `${8 + index}:00`,
      hora_fin: `${8 + index}:45`,
      motivo: paciente.referencia,
      tipo_atencion: 'Evaluacion',
      estado: 'Confirmada',
      observacion: 'Cita de evaluacion inicial.'
    },
    {
      paciente_id: paciente.id,
      fecha: addDays(baseDate, 7),
      hora_inicio: `${9 + index}:00`,
      hora_fin: `${9 + index}:45`,
      motivo: 'Control de evolucion',
      tipo_atencion: 'Control',
      estado: 'Pendiente',
      observacion: 'Seguimiento semanal.'
    }
  ]);
}

async function ensurePacientes(users) {
  for (const [index, item] of pacientes.entries()) {
    const [paciente] = await Paciente.findOrCreate({
      where: { ci: item.ci },
      defaults: { ...item, estado: true }
    });

    await ensureHistoria(paciente, users[index % users.length], index);
    await ensureSesiones(paciente, index);
    await ensureCitas(paciente, index);
  }
}

async function seedDemo() {
  try {
    await sequelize.authenticate();

    const users = await ensureUsuarios();
    await ensurePacientes(users);

    console.log('Datos demo creados/verificados correctamente.');
    console.log('Usuarios personal: mvargas, drojas, csalazar. Password: Personal123');
  } catch (error) {
    console.error('No se pudieron crear datos demo:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

seedDemo();
