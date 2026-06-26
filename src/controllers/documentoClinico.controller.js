const { Op } = require('sequelize');
const {
  sequelize,
  DocumentoClinico,
  PagoClinico,
  Paciente,
  HistoriaClinica,
  AntecedentePersonal,
  CondicionActual,
  EvaluacionFinal,
  IntervencionClinica,
  Sesion,
  Usuario
} = require('../models');

const tiposValidos = ['consentimiento', 'signos_vitales', 'farmacos'];
const estadosValidos = ['Borrador', 'Guardado', 'Finalizado', 'Anulado'];

const includeDocumento = [
  { model: Paciente, as: 'paciente' },
  { model: Usuario, as: 'creado_por', attributes: ['id', 'nombre', 'usuario', 'rol'] },
  { model: Usuario, as: 'modificado_por', attributes: ['id', 'nombre', 'usuario', 'rol'] },
  { model: Sesion, as: 'sesion' },
  { model: PagoClinico, as: 'pago' }
];

const includeHistoria = [
  { model: AntecedentePersonal, as: 'antecedente_personal' },
  { model: CondicionActual, as: 'condicion_actual' },
  { model: EvaluacionFinal, as: 'evaluacion_final' },
  { model: IntervencionClinica, as: 'intervencion_clinica' },
  { model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'usuario', 'rol'] }
];

const normalizarTipo = (value) => String(value || '').trim();
const esFechaValida = (value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

const limpiarDatosConsentimiento = (datos = {}) => ({
  nombre_completo: datos.nombre_completo || '',
  edad: datos.edad || '',
  ci: datos.ci || '',
  celular: datos.celular || '',
  tutor_nombre: datos.tutor_nombre || '',
  diagnostico: datos.diagnostico || '',
  tratamiento: datos.tratamiento || '',
  ciudad: datos.ciudad || 'La Paz',
  firma_representante: datos.firma_representante || ''
});

const buildWhere = (query) => {
  const where = { eliminado: false, activo: true };
  if (query.tipo) where.tipo = normalizarTipo(query.tipo);
  if (query.paciente_id) {
    where[Op.or] = [
      { paciente_id: query.paciente_id },
      sequelize.where(sequelize.cast(sequelize.col('DocumentoClinico.datos'), 'text'), {
        [Op.like]: `%"paciente_id":"${query.paciente_id}"%`
      })
    ];
  }
  if (query.estado) where.estado = query.estado;
  if (query.desde || query.hasta) {
    where.fecha = {};
    if (query.desde) where.fecha[Op.gte] = query.desde;
    if (query.hasta) where.fecha[Op.lte] = query.hasta;
  }
  return where;
};

const pickDocumento = (body, req) => ({
  tipo: normalizarTipo(body.tipo),
  paciente_id: body.paciente_id,
  usuario_id: body.usuario_id,
  usuario_modificacion_id: req.usuario.id,
  sesion_id: body.sesion_id || null,
  fecha: body.fecha,
  estado: body.estado || 'Guardado',
  titulo: body.titulo || null,
  descripcion: body.descripcion || null,
  datos: normalizarTipo(body.tipo) === 'consentimiento' ? limpiarDatosConsentimiento(body.datos) : body.datos || {}
});

const validarDocumento = (body) => {
  const tipo = normalizarTipo(body.tipo);
  if (!tiposValidos.includes(tipo)) return 'Tipo de documento no valido.';
  if (!body.paciente_id) return 'Selecciona un paciente.';
  if (!body.fecha || !esFechaValida(body.fecha)) return 'Registra una fecha valida.';
  if (!estadosValidos.includes(body.estado || 'Guardado')) return 'Estado no valido.';

  if (tipo === 'consentimiento') {
    if (!body.datos?.edad) return 'La edad es obligatoria.';
    if (!body.datos?.ci) return 'El CI es obligatorio.';
    if (!body.datos?.diagnostico) return 'El diagnostico es obligatorio.';
    if (!body.datos?.tratamiento) return 'El tratamiento es obligatorio.';
    if (Number(body.datos?.edad || 0) < 18 && !body.datos?.tutor_nombre) {
      return 'El tutor es obligatorio para pacientes menores de edad.';
    }
  }

  if (tipo === 'signos_vitales') {
    if (!body.datos?.responsable_nombre) return 'El responsable es obligatorio.';
    const etapas = ['pre', 'durante', 'post'];
    const tieneSignos = etapas.some((etapa) => {
      const data = body.datos?.[etapa] || {};
      return data.presion_arterial || data.frecuencia_cardiaca || data.frecuencia_respiratoria || data.spo2;
    });
    if (!tieneSignos) return 'Registra al menos una etapa de signos vitales.';
  }

  if (tipo === 'farmacos') {
    const filas = Array.isArray(body.datos?.filas) ? body.datos.filas : [];
    if (!filas.length) return 'Agrega al menos una fila.';
    for (const fila of filas) {
      if (!fila.paciente_id) return 'Cada fila debe tener paciente.';
      const tieneMedicamento = fila.diclo || fila.dexa || fila.com_b;
      if (!tieneMedicamento) return 'Cada fila debe tener al menos un medicamento marcado.';
      if (fila.qr) fila.metodo_pago = 'QR';
      if (Number(fila.monto_bs || 0) > 0 && !fila.metodo_pago) return 'Si registras monto, selecciona metodo de pago.';
    }
  }

  return null;
};

const upsertPagoFarmaco = async (documento, body, transaction) => {
  if (documento.tipo !== 'farmacos') return;
  const filas = Array.isArray(body.datos?.filas) ? body.datos.filas : [];
  const total = filas.reduce((sum, fila) => sum + Number(fila.monto_bs || 0), 0);
  const metodo = filas.find((fila) => Number(fila.monto_bs || 0) > 0)?.metodo_pago || 'Efectivo';
  const observaciones = filas.map((fila) => fila.observaciones).filter(Boolean).join(' | ');

  const actual = await PagoClinico.findOne({ where: { documento_id: documento.id }, transaction });
  if (total <= 0) {
    if (actual) await actual.update({ activo: false }, { transaction });
    return;
  }

  const payload = {
    paciente_id: documento.paciente_id,
    documento_id: documento.id,
    usuario_id: documento.usuario_id,
    fecha: documento.fecha,
    monto: total,
    concepto: 'Administracion de Farmacos',
    metodo_pago: metodo,
    observaciones,
    activo: true
  };

  if (actual) await actual.update(payload, { transaction });
  else await PagoClinico.create(payload, { transaction });
};

const listarDocumentos = async (req, res, next) => {
  try {
    const documentos = await DocumentoClinico.findAll({
      where: buildWhere(req.query),
      include: includeDocumento,
      order: [['fecha', 'DESC'], ['id', 'DESC']]
    });
    return res.json(documentos);
  } catch (error) {
    return next(error);
  }
};

const obtenerDocumento = async (req, res, next) => {
  try {
    const documento = await DocumentoClinico.findByPk(req.params.id, { include: includeDocumento });
    if (!documento || documento.eliminado) return res.status(404).json({ message: 'Documento no encontrado' });
    return res.json(documento);
  } catch (error) {
    return next(error);
  }
};

const autocompletarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const historia = await HistoriaClinica.findOne({
      where: { paciente_id: paciente.id },
      include: includeHistoria,
      order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
    });
    const sesiones = await Sesion.findAll({
      where: { paciente_id: paciente.id },
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 20
    });
    const documentos = await DocumentoClinico.findAll({
      where: { paciente_id: paciente.id, eliminado: false, activo: true },
      include: includeDocumento,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 20
    });
    const pagos = await PagoClinico.findAll({
      where: { paciente_id: paciente.id, activo: true },
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 20
    });

    const antecedentes = historia?.antecedente_personal;
    const antecedentesPatologicos = [
      antecedentes?.patologicos ? antecedentes.detalle_patologicos || 'Patologicos' : '',
      antecedentes?.hospitalarios ? antecedentes.detalle_hospitalarios || 'Hospitalarios' : '',
      antecedentes?.quirurgicos ? antecedentes.detalle_quirurgicos || 'Quirurgicos' : '',
      antecedentes?.traumaticos ? antecedentes.detalle_traumaticos || 'Traumaticos' : '',
      antecedentes?.alergicos ? antecedentes.detalle_alergicos || 'Alergicos' : '',
      antecedentes?.farmacologicos ? antecedentes.detalle_farmacologicos || 'Farmacologicos' : ''
    ].filter(Boolean).join(', ');

    return res.json({
      paciente,
      historia,
      sesiones,
      documentos,
      pagos,
      sugeridos: {
        nombre_completo: `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim(),
        edad: paciente.edad || '',
        ci: paciente.ci || '',
        celular: paciente.telefono || '',
        diagnostico: historia?.diagnostico_medico || paciente.referencia || '',
        tratamiento: historia?.evaluacion_final?.plan_tratamiento || '',
        antecedentes_patologicos: antecedentesPatologicos || antecedentes?.observaciones || '',
        observaciones_clinicas: [
          historia?.motivo_consulta,
          historia?.enfermedad_actual,
          historia?.condicion_actual?.descripcion,
          historia?.intervencion_clinica?.observaciones
        ].filter(Boolean).join('\n')
      }
    });
  } catch (error) {
    return next(error);
  }
};

const crearDocumento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const body = { ...req.body, usuario_id: req.usuario.id };
    const errorValidacion = validarDocumento(body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    const paciente = await Paciente.findByPk(body.paciente_id, { transaction });
    if (!paciente) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Paciente no encontrado' });
    }

    const documento = await DocumentoClinico.create(pickDocumento(body, req), { transaction });
    await upsertPagoFarmaco(documento, body, transaction);
    await transaction.commit();

    const completo = await DocumentoClinico.findByPk(documento.id, { include: includeDocumento });
    return res.status(201).json(completo);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const actualizarDocumento = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const documento = await DocumentoClinico.findByPk(req.params.id, { transaction });
    if (!documento || documento.eliminado) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    const body = { ...documento.toJSON(), ...req.body, tipo: documento.tipo, usuario_id: documento.usuario_id || req.usuario.id };
    const errorValidacion = validarDocumento(body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }

    await documento.update(pickDocumento(body, req), { transaction });
    await upsertPagoFarmaco(documento, body, transaction);
    await transaction.commit();

    const completo = await DocumentoClinico.findByPk(documento.id, { include: includeDocumento });
    return res.json(completo);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

const eliminarDocumento = async (req, res, next) => {
  try {
    const documento = await DocumentoClinico.findByPk(req.params.id);
    if (!documento || documento.eliminado) return res.status(404).json({ message: 'Documento no encontrado' });
    await documento.update({
      activo: false,
      eliminado: true,
      estado: 'Anulado',
      fecha_eliminacion: new Date(),
      usuario_eliminacion_id: req.usuario.id
    });
    await PagoClinico.update({ activo: false }, { where: { documento_id: documento.id } });
    return res.json({ message: 'Documento anulado correctamente' });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarDocumentos,
  obtenerDocumento,
  autocompletarPaciente,
  crearDocumento,
  actualizarDocumento,
  eliminarDocumento
};
