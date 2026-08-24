const { Op } = require('sequelize');
const { cleanDocumentText, normalizeDocumentType, patientDocumentLabel } = require('../utils/patientDocument');
const { FINANCIAL_KEYS } = require('../middlewares/financialAccess.middleware');
const { clinicalPatientEligibilityError } = require('../services/clinicalPatientEligibility.service');
const { enrichRecordsWithAdministrativePhone, patientDtoWithAdministrativePhone } = require('../services/patientAdministrativeContact.service');
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
const filaFarmacoAnulada = (fila = {}) => Boolean(fila.anulado) || String(fila.estado || '').toLowerCase() === 'anulado';
const historiaActivaWhere = {
  anulada: false,
  estado: { [Op.ne]: 'anulada' }
};

const validarHistoriasSeleccionadas = async (body, transaction) => {
  const referencias = [];
  if (body.historia_clinica_id) {
    referencias.push({
      historiaId: body.historia_clinica_id,
      pacienteId: body.paciente_id
    });
  }

  if (normalizarTipo(body.tipo) === 'farmacos') {
    (body.datos?.filas || [])
      .filter((fila) => !filaFarmacoAnulada(fila) && fila.historia_clinica_id)
      .forEach((fila) => referencias.push({
        historiaId: fila.historia_clinica_id,
        pacienteId: fila.paciente_id
      }));
  }

  for (const referencia of referencias) {
    const historia = await HistoriaClinica.findOne({
      where: {
        id: referencia.historiaId,
        paciente_id: referencia.pacienteId,
        ...historiaActivaWhere
      },
      transaction
    });
    if (!historia) return 'La historia clínica seleccionada está anulada o no pertenece al paciente.';
  }

  return null;
};

const limpiarDatosConsentimiento = (datos = {}) => ({
  nombre_completo: datos.nombre_completo || '',
  edad: datos.edad || '',
  ci: datos.ci || '',
  tipo_documento: normalizeDocumentType(datos.tipo_documento) || (datos.ci ? 'CI' : null),
  numero_documento: cleanDocumentText(datos.numero_documento) || cleanDocumentText(datos.ci) || '',
  nombre_documento_otro: normalizeDocumentType(datos.tipo_documento) === 'OTRO' ? cleanDocumentText(datos.nombre_documento_otro) || '' : '',
  celular: datos.celular || '',
  tutor_nombre: datos.tutor_nombre || '',
  diagnostico: datos.diagnostico || '',
  tratamiento: datos.tratamiento || '',
  ciudad: datos.ciudad || 'La Paz',
  firma_representante: datos.firma_representante || ''
});

const buildWhere = (query, role) => {
  const incluirAnulados = role === 'admin' && String(query.incluir_anulados || '').toLowerCase() === 'true';
  const where = incluirAnulados ? {} : { eliminado: false, activo: true };
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

const restaurarDatosFinancieros = (anterior, recibido) => {
  if (Array.isArray(recibido)) {
    const anteriores = Array.isArray(anterior) ? anterior : [];
    return recibido.map((item, index) => {
      const previo = item?.id
        ? anteriores.find((candidate) => String(candidate?.id) === String(item.id))
        : anteriores[index];
      return restaurarDatosFinancieros(previo, item);
    });
  }
  if (!recibido || typeof recibido !== 'object') return recibido;
  const previo = anterior && typeof anterior === 'object' ? anterior : {};
  const resultado = Object.entries(recibido).reduce((acc, [key, value]) => {
    acc[key] = restaurarDatosFinancieros(previo[key], value);
    return acc;
  }, {});
  Object.entries(previo).forEach(([key, value]) => {
    if (FINANCIAL_KEYS.has(String(key).toLowerCase())) resultado[key] = value;
  });
  return resultado;
};

const validarDocumento = (body) => {
  const tipo = normalizarTipo(body.tipo);
  if (!tiposValidos.includes(tipo)) return 'Tipo de documento no valido.';
  if (!body.paciente_id) return 'Selecciona un paciente.';
  if (!body.fecha || !esFechaValida(body.fecha)) return 'Registra una fecha valida.';
  if (!estadosValidos.includes(body.estado || 'Guardado')) return 'Estado no valido.';

  if (tipo === 'consentimiento') {
    if (!body.datos?.edad) return 'La edad es obligatoria.';
    if (!(body.datos?.numero_documento || body.datos?.ci)) return 'El documento de identidad es obligatorio.';
    if ((body.datos?.tipo_documento || (body.datos?.ci ? 'CI' : null)) === 'OTRO' && !body.datos?.nombre_documento_otro) return 'El nombre del documento es obligatorio.';
    if (!body.datos?.diagnostico) return 'El diagnostico es obligatorio.';
    if (!body.datos?.tratamiento) return 'El tratamiento es obligatorio.';
    if (Number(body.datos?.edad || 0) < 18 && !body.datos?.tutor_nombre) {
      return 'El tutor es obligatorio para pacientes menores de edad.';
    }
  }

  if (tipo === 'signos_vitales') {
    if (!body.datos?.responsable_nombre) return 'El responsable es obligatorio.';
  }

  if (tipo === 'farmacos') {
    const filas = Array.isArray(body.datos?.filas) ? body.datos.filas : [];
    if (!filas.length) return 'Agrega al menos una fila.';
    for (const fila of filas) {
      if (filaFarmacoAnulada(fila)) continue;
      if (!fila.paciente_id) return 'Cada fila debe tener paciente.';
      const productos = Array.isArray(fila.productos) ? fila.productos.filter((producto) => producto.producto) : [];
      const tieneMedicamento = productos.length || fila.diclo || fila.dexa || fila.com_b || fila.otro || fila.otro_farmaco;
      if (!tieneMedicamento) return 'Cada fila debe tener al menos un medicamento marcado.';
      for (const producto of productos) {
        if (producto.producto === 'Otro' && !String(producto.nombre_otro || '').trim()) return 'Especifica el nombre del fármaco.';
        if (!(Number(producto.cantidad) > 0)) return 'La cantidad de cada fármaco debe ser mayor a cero.';
        if (!String(producto.dosis || producto.volumen || producto.presentacion || '').trim()) return 'Registra la presentación o dosis de cada fármaco.';
        if (!String(producto.via || '').trim()) return 'Registra la vía de administración de cada fármaco.';
      }
      if (!String(fila.motivo || '').trim()) return 'El motivo clínico es obligatorio.';
      if (fila.qr) fila.metodo_pago = 'QR';
      if (Number(fila.monto_bs || 0) > 0 && !fila.metodo_pago) return 'Si registras monto, selecciona metodo de pago.';
    }
  }

  return null;
};

const upsertPagoFarmaco = async (documento, body, transaction) => {
  if (documento.tipo !== 'farmacos') return;
  const filas = (Array.isArray(body.datos?.filas) ? body.datos.filas : []).filter((fila) => !filaFarmacoAnulada(fila));
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
      where: buildWhere(req.query, req.usuario.rol),
      include: includeDocumento,
      order: [['fecha', 'DESC'], ['id', 'DESC']]
    });
    return res.json(await enrichRecordsWithAdministrativePhone(documentos));
  } catch (error) {
    return next(error);
  }
};

const obtenerDocumento = async (req, res, next) => {
  try {
    const documento = await DocumentoClinico.findByPk(req.params.id, { include: includeDocumento });
    if (!documento || documento.eliminado) return res.status(404).json({ message: 'Documento no encontrado' });
    return res.json(await enrichRecordsWithAdministrativePhone(documento));
  } catch (error) {
    return next(error);
  }
};

const autocompletarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.pacienteId);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const historia = await HistoriaClinica.findOne({
      where: {
        paciente_id: paciente.id,
        ...historiaActivaWhere
      },
      include: includeHistoria,
      order: [['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
    });
    const sesiones = await Sesion.findAll({
      where: { paciente_id: paciente.id, anulada: false },
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 20
    });
    const documentos = await DocumentoClinico.findAll({
      where: { paciente_id: paciente.id, eliminado: false, activo: true },
      include: includeDocumento,
      order: [['fecha', 'DESC'], ['id', 'DESC']],
      limit: 20
    });
    const pagos = req.usuario.rol === 'admin'
      ? await PagoClinico.findAll({
        where: { paciente_id: paciente.id, activo: true },
        order: [['fecha', 'DESC'], ['id', 'DESC']],
        limit: 20
      })
      : [];

    const antecedentes = historia?.antecedente_personal;
    const antecedentesPatologicos = [
      antecedentes?.patologicos ? antecedentes.detalle_patologicos || 'Patologicos' : '',
      antecedentes?.hospitalarios ? antecedentes.detalle_hospitalarios || 'Hospitalarios' : '',
      antecedentes?.quirurgicos ? antecedentes.detalle_quirurgicos || 'Quirurgicos' : '',
      antecedentes?.traumaticos ? antecedentes.detalle_traumaticos || 'Traumaticos' : '',
      antecedentes?.alergicos ? antecedentes.detalle_alergicos || 'Alergicos' : '',
      antecedentes?.farmacologicos ? antecedentes.detalle_farmacologicos || 'Farmacologicos' : ''
    ].filter(Boolean).join(', ');

    const pacienteDto = await patientDtoWithAdministrativePhone(paciente);
    const responsable = pacienteDto.responsable_principal;
    return res.json({
      paciente: pacienteDto,
      historia,
      sesiones,
      documentos,
      pagos,
      sugeridos: {
        nombre_completo: `${paciente.nombres || ''} ${paciente.apellidos || ''}`.trim(),
        edad: paciente.edad || '',
        ci: paciente.ci || '',
        tipo_documento: paciente.tipo_documento || (paciente.ci ? 'CI' : null),
        numero_documento: paciente.numero_documento || paciente.ci || '',
        nombre_documento_otro: paciente.nombre_documento_otro || '',
        documento: patientDocumentLabel(paciente),
        celular: pacienteDto.telefono_administrativo || pacienteDto.telefono || '',
        telefono_fuente: pacienteDto.telefono_fuente,
        tutor_nombre: responsable ? `${responsable.nombres || ''} ${responsable.apellidos || ''}`.trim() : '',
        tutor_parentesco: responsable?.parentesco_otro || responsable?.parentesco || '',
        tutor_tipo_documento: responsable?.tipo_documento || '',
        tutor_numero_documento: responsable?.numero_documento || '',
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
    const pacienteError = clinicalPatientEligibilityError(paciente);
    if (pacienteError) {
      await transaction.rollback();
      return res.status(pacienteError.status).json({ message: pacienteError.message });
    }
    const errorHistoria = await validarHistoriasSeleccionadas(body, transaction);
    if (errorHistoria) {
      await transaction.rollback();
      return res.status(400).json({ message: errorHistoria });
    }

    const documento = await DocumentoClinico.create(pickDocumento(body, req), { transaction });
    if (req.usuario.rol === 'admin') await upsertPagoFarmaco(documento, body, transaction);
    await transaction.commit();

    const completo = await DocumentoClinico.findByPk(documento.id, { include: includeDocumento });
    return res.status(201).json(await enrichRecordsWithAdministrativePhone(completo));
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

    const datosRecibidos = req.body.datos || documento.datos || {};
    const datos = req.usuario.rol === 'personal'
      ? restaurarDatosFinancieros(documento.datos || {}, datosRecibidos)
      : datosRecibidos;
    const body = {
      ...documento.toJSON(),
      ...req.body,
      datos,
      tipo: documento.tipo,
      usuario_id: documento.usuario_id || req.usuario.id
    };
    const errorValidacion = validarDocumento(body);
    if (errorValidacion) {
      await transaction.rollback();
      return res.status(400).json({ message: errorValidacion });
    }
    const errorHistoria = await validarHistoriasSeleccionadas(body, transaction);
    if (errorHistoria) {
      await transaction.rollback();
      return res.status(400).json({ message: errorHistoria });
    }

    await documento.update(pickDocumento(body, req), { transaction });
    if (req.usuario.rol === 'admin') await upsertPagoFarmaco(documento, body, transaction);
    await transaction.commit();

    const completo = await DocumentoClinico.findByPk(documento.id, { include: includeDocumento });
    return res.json(await enrichRecordsWithAdministrativePhone(completo));
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
