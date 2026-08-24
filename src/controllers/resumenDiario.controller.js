const { Op } = require('sequelize');
const {
  ActividadSistema, ConceptoCobro, HistoriaClinica, InformeMedico, MovimientoPago,
  ObservacionDiaria, Paciente, Personal, Sesion, TareaPersonal, Usuario
} = require('../models');
const { BOLIVIA_TIME_ZONE, boliviaDate } = require('../utils/boliviaDateTime');

const boliviaRange = (fechaInicio, fechaFin = fechaInicio) => ({
  [Op.between]: [new Date(`${fechaInicio}T00:00:00-04:00`), new Date(`${fechaFin}T23:59:59.999-04:00`)]
});
const dateRange = (fechaInicio, fechaFin = fechaInicio) => ({ [Op.between]: [fechaInicio, fechaFin] });
const time = (value) => value ? new Intl.DateTimeFormat('es-BO', { timeZone: BOLIVIA_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)) : 'Sin hora';
const name = (patient) => [patient?.nombres, patient?.apellidos].filter(Boolean).join(' ') || 'Paciente no disponible';
const staffName = (user) => user?.ficha_personal?.nombre_mostrado || user?.nombre || user?.usuario || 'Sin registrar';
const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const hasEvolution = (session) => Boolean(session.descripcion_tratamiento || session.evolucion_observada || session.dolor_despues !== null && session.dolor_despues !== undefined);

const sessionInclude = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'fecha_evaluacion', 'diagnostico_medico', 'motivo_consulta', 'estado', 'anulada'] },
  { model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }
];

const getDailyData = async (fechaInicio, fechaFin = fechaInicio) => {
  const [sessions, histories, reports, payments, concepts, newPatients, activities, tasks, manualObservations] = await Promise.all([
    Sesion.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin), anulada: false }, include: sessionInclude, order: [['fecha', 'DESC'], ['created_at', 'DESC']] }),
    HistoriaClinica.findAll({ where: { created_at: boliviaRange(fechaInicio, fechaFin), anulada: false }, include: [{ model: Paciente, as: 'paciente' }, { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }] }),
    InformeMedico.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin) }, include: [{ model: Paciente, as: 'paciente' }, { model: HistoriaClinica, as: 'historia_clinica' }] }),
    MovimientoPago.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin), estado: 'Activo' }, include: [{ model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }, { model: ConceptoCobro, as: 'concepto', include: [{ model: Paciente, as: 'paciente' }, { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'fecha_evaluacion'] }, { model: Sesion, as: 'sesion', attributes: ['id', 'numero_sesion', 'fecha'] }, { model: MovimientoPago, as: 'movimientos', required: false, where: { estado: 'Activo' } }] }], order: [['fecha', 'DESC'], ['hora', 'DESC']] }),
    ConceptoCobro.findAll({ where: { activo: true }, include: [{ model: Paciente, as: 'paciente' }, { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'fecha_evaluacion'] }, { model: Sesion, as: 'sesion', attributes: ['id', 'numero_sesion', 'fecha'] }, { model: MovimientoPago, as: 'movimientos', required: false, where: { estado: 'Activo' } }] }),
    Paciente.findAll({ where: { created_at: boliviaRange(fechaInicio, fechaFin), estado: true } }),
    ActividadSistema.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin) }, include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }, { model: Paciente, as: 'paciente' }], order: [['fecha', 'DESC'], ['hora', 'DESC']] }),
    TareaPersonal.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin), estado: { [Op.ne]: 'cancelada' } }, include: [{ model: Personal, as: 'personal' }, { model: Usuario, as: 'asignado_a', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }, { model: Paciente, as: 'paciente' }] }),
    ObservacionDiaria.findAll({ where: { fecha: dateRange(fechaInicio, fechaFin), activo: true }, include: [{ model: Paciente, as: 'paciente' }, { model: Usuario, as: 'responsable', attributes: ['id', 'nombre', 'usuario'], include: [{ model: Personal, as: 'ficha_personal' }] }], order: [['fecha', 'DESC'], ['hora', 'DESC']] })
  ]);

  const sessionsJson = sessions.map((item) => item.toJSON());
  const attentions = sessionsJson.map((session) => ({
    id: session.id, fecha: session.fecha, hora: time(session.created_at), paciente: name(session.paciente), ci: session.paciente?.ci,
    historia: session.historia_clinica?.diagnostico_medico || session.historia_clinica?.motivo_consulta || 'Sin diagnóstico',
    historia_id: session.historia_clinica_id, paciente_id: session.paciente_id, numero_sesion: session.numero_sesion,
    asistencia: session.asistencia, profesional: session.profesional_responsable || staffName(session.registrado_por),
    evolutivo: hasEvolution(session) ? 'Registrado' : 'Pendiente', dolor_inicial: session.dolor_antes,
    dolor_final: session.dolor_despues, observacion: session.evolucion_observada || session.observacion
  }));

  const paymentsJson = payments.map((movement) => {
    const item = movement.toJSON();
    const allActive = (item.concepto?.movimientos || []).filter((row) => row.estado === 'Activo');
    const paid = allActive.reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const remaining = Math.max(Number(item.concepto?.monto_esperado || 0) - paid, 0);
    return { id: item.id, concepto_id: item.concepto_cobro_id, fecha: item.fecha, hora: String(item.hora || '').slice(0, 5), paciente: name(item.concepto?.paciente), concepto: item.concepto?.detalle, historia: item.concepto?.historia_clinica?.diagnostico_medico || 'Sin historia', sesion: item.concepto?.sesion?.numero_sesion, monto: money(item.monto), metodo: item.metodo, saldo: money(remaining), estado: remaining > 0 ? 'Parcial' : 'Pagado', recibido_por: staffName(item.recibido_por), recibo: item.numero_recibo, comprobante: item.numero_comprobante, observacion: item.observacion };
  });

  const debts = concepts.map((concept) => {
    const item = concept.toJSON(); const paid = (item.movimientos || []).reduce((sum, movement) => sum + Number(movement.monto || 0), 0); const balance = money(Math.max(Number(item.monto_esperado || 0) - paid, 0));
    if (balance <= 0 || item.exonerado) return null;
    const last = [...(item.movimientos || [])].sort((a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))[0];
    const generatedInRange = item.fecha_origen >= fechaInicio && item.fecha_origen <= fechaFin;
    return { id: item.id, paciente: name(item.paciente), historia: item.historia_clinica?.diagnostico_medico || 'Sin historia', concepto: item.detalle, fecha_origen: item.fecha_origen, monto_esperado: money(item.monto_esperado), total_pagado: money(paid), saldo: balance, ultimo_pago: last?.fecha || null, estado: paid > 0 ? 'Parcial' : 'Pendiente', origen: generatedInRange ? 'Generada hoy' : 'Anterior' };
  }).filter(Boolean).sort((a, b) => b.saldo - a.saldo);

  const evolutions = attentions.map((attention) => ({ ...attention, procedimiento: attention.observacion || 'Sin registrar', estado: attention.evolutivo }));
  const drugs = sessionsJson.flatMap((session) => {
    if (session.anulada || session.asistencia !== 'asistio') return [];
    const farmacos = Array.isArray(session.farmacos) ? session.farmacos.filter((item) => item.estado !== 'anulado') : [];
    if (farmacos.length) return farmacos.map((farmaco) => ({ id: session.id, paciente_id: session.paciente_id, fecha: session.fecha, hora: time(session.created_at), paciente: name(session.paciente), historia: session.historia_clinica?.diagnostico_medico || 'Sin historia', sesion: session.numero_sesion, farmaco: farmaco.nombre, dosis: farmaco.presentacion_dosis || 'Sin registrar', via: farmaco.via || 'Sin registrar', precio_unitario: money(farmaco.precio_unitario), subtotal: money(farmaco.subtotal ?? Number(farmaco.cantidad || 0) * Number(farmaco.precio_unitario || 0)), profesional: session.profesional_responsable || staffName(session.registrado_por), observacion: farmaco.observacion || farmaco.motivo_clinico }));
    if (!(session.aplica_farmacos || session.inyectable_nombre || session.observacion_farmacos)) return [];
    return [{ id: session.id, paciente_id: session.paciente_id, fecha: session.fecha, hora: time(session.created_at), paciente: name(session.paciente), historia: session.historia_clinica?.diagnostico_medico || 'Sin historia', sesion: session.numero_sesion, farmaco: session.inyectable_nombre || session.observacion_farmacos || 'Fármaco registrado', dosis: session.inyectable_dosis || 'Sin registrar', via: 'Sin registrar', profesional: session.profesional_responsable || staffName(session.registrado_por), observacion: session.observacion_farmacos }];
  });

  const observations = [
    ...attentions.filter((item) => item.asistencia === 'no_asistio').map((item) => ({ id: `falta-${item.id}`, hora: item.hora, categoria: 'Pacientes que faltaron', descripcion: `${item.paciente} no asistió a la sesión ${item.numero_sesion}.`, paciente: item.paciente, personal: item.profesional, estado: 'Pendiente', automatico: true })),
    ...attentions.filter((item) => item.observacion).map((item) => ({ id: `clinica-${item.id}`, hora: item.hora, categoria: 'Observaciones clínicas', descripcion: item.observacion, paciente: item.paciente, personal: item.profesional, estado: 'Registrada', automatico: true })),
    ...tasks.map((task) => ({ id: `tarea-${task.id}`, hora: String(task.hora || '').slice(0, 5) || 'Sin hora', categoria: 'Tareas pendientes', descripcion: task.descripcion || task.titulo, paciente: name(task.paciente), personal: staffName(task.asignado_a), estado: task.estado, automatico: true })),
    ...manualObservations.map((row) => { const item = row.toJSON(); return { id: item.id, hora: String(item.hora).slice(0, 5), categoria: item.categoria, descripcion: item.descripcion, paciente: item.paciente ? name(item.paciente) : 'No aplica', personal: staffName(item.responsable), estado: item.estado, automatico: false }; })
  ];

  const staff = new Map();
  const touch = (key, shown) => { if (!key) return null; if (!staff.has(key)) staff.set(key, { id: key, nombre: shown, cargo: '', pacientes: new Set(), sesiones: 0, evolutivos: 0, pagos: 0, historias: 0, informes: 0, planillas: 0, tareas: 0, actividades: [] }); return staff.get(key); };
  sessionsJson.forEach((session) => { const row = touch(session.usuario_id, session.profesional_responsable || staffName(session.registrado_por)); if (!row) return; row.pacientes.add(session.paciente_id); row.sesiones += 1; if (hasEvolution(session)) row.evolutivos += 1; });
  paymentsJson.forEach((payment, index) => { const movement = payments[index]; const row = touch(movement.usuario_receptor_id, payment.recibido_por); if (row) row.pagos += 1; });
  histories.forEach((history) => { const row = touch(history.usuario_id, staffName(history.usuario)); if (row) row.historias += 1; });
  tasks.forEach((task) => { const key = task.asignado_usuario_id || task.usuario_id; const row = touch(key, staffName(task.asignado_a)); if (row) row.tareas += 1; });
  activities.forEach((activity) => { const row = touch(activity.usuario_id, staffName(activity.usuario)); if (row) row.actividades.push({ hora: String(activity.hora).slice(0, 5), tipo: activity.accion, descripcion: activity.detalle, modulo: activity.modulo, paciente: activity.paciente ? name(activity.paciente) : null }); });
  const personnel = [...staff.values()].map((row) => ({ ...row, pacientes: row.pacientes.size, total: row.sesiones + row.evolutivos + row.pagos + row.historias + row.informes + row.planillas + row.tareas + row.actividades.length })).sort((a, b) => b.total - a.total);

  const indicators = {
    pacientes_atendidos: new Set(attentions.filter((item) => item.asistencia === 'asistio').map((item) => item.paciente_id)).size,
    pacientes_nuevos: newPatients.length, sesiones_realizadas: attentions.filter((item) => item.asistencia === 'asistio').length,
    faltas: attentions.filter((item) => item.asistencia === 'no_asistio').length, sesiones_pendientes: attentions.filter((item) => item.asistencia === 'pendiente').length,
    historias_creadas: histories.length, evolutivos_registrados: evolutions.filter((item) => item.estado === 'Registrado').length,
    evolutivos_pendientes: evolutions.filter((item) => item.estado === 'Pendiente' && item.asistencia === 'asistio').length,
    informes_generados: reports.length, total_cobrado: money(paymentsJson.reduce((sum, item) => sum + item.monto, 0)),
    total_pendiente: money(debts.filter((item) => item.origen === 'Generada hoy').reduce((sum, item) => sum + item.saldo, 0)),
    pagos_registrados: paymentsJson.length, farmacos_aplicados: drugs.length, personal_actividad: personnel.length
  };
  const alerts = [
    indicators.faltas && { tipo: 'Faltas', texto: `${indicators.faltas} paciente(s) no asistieron.` },
    indicators.evolutivos_pendientes && { tipo: 'Evoluciones', texto: `${indicators.evolutivos_pendientes} evolución(es) pendientes.` },
    debts.length && { tipo: 'Deudas', texto: `${new Set(debts.map((item) => item.paciente)).size} paciente(s) mantienen deuda.` },
    attentions.some((item) => item.asistencia === 'asistio' && item.dolor_final == null) && { tipo: 'Dolor final', texto: 'Existen sesiones sin dolor final registrado.' },
    paymentsJson.some((item) => ['QR', 'Transferencia'].includes(item.metodo) && !item.comprobante) && { tipo: 'Comprobantes', texto: 'Existen pagos electrónicos sin comprobante.' }
  ].filter(Boolean);
  return { indicators, attentions, payments: paymentsJson, debts, evolutions, drugs, personnel, observations, alerts };
};

exports.obtenerResumenDiario = async (req, res, next) => {
  try {
    const fechaInicio = req.query.fecha_inicio || req.query.fecha || boliviaDate();
    const fechaFin = req.query.fecha_fin || fechaInicio;
    if (fechaInicio > fechaFin) return res.status(400).json({ message: 'La fecha inicial no puede ser posterior a la fecha final.' });
    const section = req.query.seccion || 'resumen';
    const data = await getDailyData(fechaInicio, fechaFin);
    const counts = { resumen: 1, atenciones: data.attentions.length, pagos: data.payments.length, deudas: data.debts.length, evolutivos: data.evolutions.length, farmacos: data.drugs.length, personal: data.personnel.length, observaciones: data.observations.length };
    const response = { fecha: fechaInicio, fecha_inicio: fechaInicio, fecha_fin: fechaFin, indicadores: data.indicators, contadores: counts };
    if (section === 'resumen') Object.assign(response, { ultimas_atenciones: data.attentions.slice(0, 5), ultimos_pagos: data.payments.slice(0, 5), alertas: data.alerts });
    else if (section === 'todo') Object.assign(response, data);
    else response[section] = data[section === 'atenciones' ? 'attentions' : section === 'pagos' ? 'payments' : section === 'deudas' ? 'debts' : section === 'evolutivos' ? 'evolutions' : section === 'farmacos' ? 'drugs' : section === 'personal' ? 'personnel' : 'observations'];
    res.json(response);
  } catch (error) { next(error); }
};

exports.crearObservacion = async (req, res, next) => {
  try {
    if (!req.body.fecha || !req.body.hora || !req.body.categoria || !req.body.descripcion) return res.status(400).json({ message: 'Fecha, hora, categoría y descripción son obligatorias.' });
    const observation = await ObservacionDiaria.create({ fecha: req.body.fecha, hora: req.body.hora, categoria: req.body.categoria, descripcion: req.body.descripcion, paciente_id: req.body.paciente_id || null, responsable_id: req.body.responsable_id || req.usuario.id, creado_por_id: req.usuario.id, estado: req.body.estado || 'Pendiente' });
    res.status(201).json({ message: 'Observación registrada correctamente.', observacion: observation });
  } catch (error) { next(error); }
};

exports.actualizarObservacion = async (req, res, next) => {
  try {
    const observation = await ObservacionDiaria.findByPk(req.params.id); if (!observation || !observation.activo) return res.status(404).json({ message: 'Observación no encontrada.' });
    await observation.update({ categoria: req.body.categoria ?? observation.categoria, hora: req.body.hora ?? observation.hora, descripcion: req.body.descripcion ?? observation.descripcion, paciente_id: req.body.paciente_id === '' ? null : req.body.paciente_id ?? observation.paciente_id, responsable_id: req.body.responsable_id ?? observation.responsable_id, estado: req.body.estado ?? observation.estado });
    res.json({ message: 'Observación actualizada correctamente.', observacion: observation });
  } catch (error) { next(error); }
};

exports.getDailyData = getDailyData;
