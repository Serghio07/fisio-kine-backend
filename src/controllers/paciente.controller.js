const { Op } = require('sequelize');
const {
  Cita,
  ConceptoCobro,
  EvaluacionFinal,
  HistoriaClinica,
  MovimientoPago,
  Paciente,
  Contacto,
  PacienteContacto,
  Sesion,
  Usuario,
  WhatsappReceptionReferral,
  WhatsappSolicitudCita
} = require('../models');
const { validarImagen } = require('../utils/imagen');
const { boliviaDate } = require('../utils/boliviaDateTime');
const { normalizePhoneNumber } = require('../utils/phone');
const {
  DOCUMENT_TYPES,
  DOCUMENT_NUMBER_PATTERN,
  cleanDocumentText,
  normalizePatientDocument,
  normalizeDocumentType
} = require('../utils/patientDocument');
const appointmentAvailability = require('../services/appointmentAvailability.service');
const { syncAppointmentById } = require('../services/googleCalendarSync.service');
const contactoService = require('../services/contacto.service');
const pacienteContactoService = require('../services/pacienteContacto.service');
const { isMinorByBirthDate, resolveAdministrativePhone, patientDtoWithAdministrativePhone, patientDtosWithAdministrativePhone } = require('../services/patientAdministrativeContact.service');

const PHONE_DUPLICATE_MESSAGE = 'Ya existe un paciente registrado con este número de teléfono.';
const PHONE_INVALID_MESSAGE = 'El número de teléfono no es válido.';

const camposPaciente = [
  'nombres', 'apellidos', 'ci', 'tipo_documento', 'numero_documento', 'nombre_documento_otro',
  'fecha_nacimiento', 'lugar_nacimiento',
  'sexo', 'telefono', 'foto', 'peso', 'talla', 'domicilio',
  'estado_civil', 'ocupacion', 'referencia'
];
const camposMayuscula = [
  'nombres', 'apellidos', 'lugar_nacimiento', 'estado_civil',
  'ocupacion', 'domicilio', 'referencia'
];

const textoLimpio = (value, mayuscula = false) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const limpio = String(value).trim().replace(/\s+/g, ' ');
  if (!limpio) return null;
  return mayuscula ? limpio.toLocaleUpperCase('es-BO') : limpio;
};

const calcularEdad = (fecha) => {
  if (!fecha) return null;
  const nacimiento = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(nacimiento.getTime())) return null;
  const hoy = new Date(`${boliviaDate()}T12:00:00-04:00`);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad;
};

const normalizarPaciente = (body) => {
  const data = camposPaciente.reduce((result, campo) => {
    if (!Object.prototype.hasOwnProperty.call(body, campo)) return result;
    result[campo] = body[campo];
    return result;
  }, {});

  camposMayuscula.forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) {
      data[campo] = textoLimpio(data[campo], true);
    }
  });
  ['ci', 'telefono'].forEach((campo) => {
    if (Object.prototype.hasOwnProperty.call(data, campo)) data[campo] = textoLimpio(data[campo]);
  });
  const hasDocumentInput = ['tipo_documento', 'numero_documento', 'nombre_documento_otro']
    .some((campo) => Object.prototype.hasOwnProperty.call(body, campo));
  if (hasDocumentInput || Object.prototype.hasOwnProperty.call(body, 'ci')) {
    const tipo = normalizeDocumentType(data.tipo_documento) || (!hasDocumentInput && data.ci ? 'CI' : null);
    const numero = cleanDocumentText(data.numero_documento) || (tipo === 'CI' ? cleanDocumentText(data.ci) : null);
    data.tipo_documento = tipo;
    data.numero_documento = numero;
    data.numero_documento_normalizado = normalizePatientDocument(numero);
    data.nombre_documento_otro = tipo === 'OTRO' ? cleanDocumentText(data.nombre_documento_otro) : null;
    data.ci = tipo === 'CI' ? numero : null;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'telefono')) {
    data.telefono_normalizado = normalizePhoneNumber(data.telefono) || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'sexo')) {
    const sexo = textoLimpio(data.sexo, true);
    data.sexo = sexo === 'M' ? 'MASCULINO' : sexo === 'F' ? 'FEMENINO' : sexo;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'fecha_nacimiento')) {
    data.fecha_nacimiento = data.fecha_nacimiento || null;
    data.edad = calcularEdad(data.fecha_nacimiento);
  }

  if (Object.prototype.hasOwnProperty.call(data, 'peso')) data.peso = data.peso === '' || data.peso === null ? null : Number(data.peso);
  if (Object.prototype.hasOwnProperty.call(data, 'talla')) data.talla = data.talla === '' || data.talla === null ? null : Number(data.talla);
  if (Object.prototype.hasOwnProperty.call(data, 'peso') || Object.prototype.hasOwnProperty.call(data, 'talla')) {
    const peso = Number(data.peso);
    const talla = Number(data.talla);
    data.imc = peso > 0 && talla > 0 ? Number((peso / (talla ** 2)).toFixed(2)) : null;
  }
  return data;
};

const validarPaciente = (data, { hasAdministrativeContact = false } = {}) => {
  const tipoDocumento = data.tipo_documento || (data.ci ? 'CI' : null);
  const numeroDocumento = data.numero_documento || data.ci;
  if (!data.nombres) return 'Los nombres son obligatorios.';
  if (!data.apellidos) return 'Los apellidos son obligatorios.';
  if (!tipoDocumento) return 'El tipo de documento es obligatorio.';
  if (!DOCUMENT_TYPES.includes(tipoDocumento)) return 'El tipo de documento no es válido.';
  if (!numeroDocumento) return 'El número de documento es obligatorio.';
  const isMinor = isMinorByBirthDate(data.fecha_nacimiento);
  if (!data.telefono && !isMinor) return 'El teléfono es obligatorio para pacientes adultos.';
  if (isMinor && !hasAdministrativeContact) return 'Debe seleccionar un responsable principal para el paciente menor.';
  if (!data.sexo) return 'El sexo es obligatorio.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.nombres)) return 'Los nombres no pueden contener números.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.apellidos)) return 'Los apellidos no pueden contener números.';
  if (numeroDocumento.length > 50 || !DOCUMENT_NUMBER_PATTERN.test(numeroDocumento)) return 'El número de documento contiene caracteres no válidos.';
  if (tipoDocumento === 'CI' && !/^\d+$/.test(numeroDocumento)) return 'El CI solo puede contener números.';
  if (tipoDocumento === 'OTRO' && !data.nombre_documento_otro) return 'El nombre del documento es obligatorio cuando el tipo es OTRO.';
  if (data.nombre_documento_otro && data.nombre_documento_otro.length > 100) return 'El nombre del documento no puede superar 100 caracteres.';
  if (data.telefono && !normalizePhoneNumber(data.telefono)) return PHONE_INVALID_MESSAGE;
  if (!['MASCULINO', 'FEMENINO'].includes(data.sexo)) return 'Selecciona MASCULINO o FEMENINO.';
  if (data.fecha_nacimiento && data.fecha_nacimiento > boliviaDate()) return 'La fecha de nacimiento no puede ser futura.';
  if (data.peso !== null && data.peso !== undefined && (!Number.isFinite(data.peso) || data.peso <= 0)) return 'El peso debe ser mayor que cero.';
  if (data.talla !== null && data.talla !== undefined && (!Number.isFinite(data.talla) || data.talla <= 0)) return 'La talla debe ser mayor que cero.';
  return null;
};

const validarCiUnico = async (ci, id = null) => {
  if (!ci) return true;
  const where = { ci };
  if (id) where.id = { [Op.ne]: id };
  return !(await Paciente.findOne({ where, attributes: ['id'] }));
};

const validarDocumentoUnico = async (tipoDocumento, numeroNormalizado, id = null) => {
  if (!tipoDocumento || !numeroNormalizado) return true;
  const where = { tipo_documento: tipoDocumento, numero_documento_normalizado: numeroNormalizado };
  if (id) where.id = { [Op.ne]: id };
  return !(await Paciente.findOne({ where, attributes: ['id'] }));
};

const validarTelefonoUnico = async (telefonoNormalizado, id = null) => {
  if (!telefonoNormalizado) return true;
  const where = { telefono_normalizado: telefonoNormalizado };
  if (id) where.id = { [Op.ne]: id };
  return !(await Paciente.findOne({ where, attributes: ['id'] }));
};

const isPhoneUniqueConstraintError = (error) => {
  if (error?.name !== 'SequelizeUniqueConstraintError') return false;
  if (error?.fields?.telefono_normalizado !== undefined) return true;
  return String(error?.parent?.constraint || error?.constraint || '').includes('telefono_normalizado');
};

const isDocumentUniqueConstraintError = (error) => error?.name === 'SequelizeUniqueConstraintError'
  && String(error?.parent?.constraint || error?.constraint || '').includes('documento');

const findAdministrativePatientIdsByPhone = async (search, { relationModel = PacienteContacto, contactModel = Contacto } = {}) => {
  const normalizedPhone = normalizePhoneNumber(search);
  if (!normalizedPhone) return [];
  const rows = await relationModel.findAll({
    where: { estado: true, fecha_fin: null, es_contacto_principal: true },
    attributes: ['paciente_id'],
    include: [{
      model: contactModel,
      as: 'contacto',
      required: true,
      attributes: [],
      where: {
        estado: true,
        [Op.or]: [
          { telefono: { [Op.iLike]: `%${search}%` } },
          { telefono_normalizado: { [Op.iLike]: `%${normalizedPhone}%` } }
        ]
      }
    }],
    raw: true
  });
  return [...new Set(rows.map((item) => Number(item.paciente_id)).filter(Number.isInteger))];
};

const listarPacientes = async (req, res, next) => {
  try {
    const usesMobileQuery = ['search', 'estado', 'page', 'limit'].some(
      (key) => Object.prototype.hasOwnProperty.call(req.query, key)
    );
    if (usesMobileQuery) {
      const search = String(req.query.search || '').trim().replace(/\s+/g, ' ');
      const estado = String(req.query.estado || 'active').toLowerCase();
      const sexo = String(req.query.sexo || '').trim().toLocaleUpperCase('es-BO');
      const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
      const where = { registro_pendiente: false };

      if (estado === 'active') where.estado = true;
      if (estado === 'inactive') where.estado = false;
      if (['MASCULINO', 'FEMENINO'].includes(sexo)) where.sexo = sexo;
      if (search) {
        const normalizedPhone = normalizePhoneNumber(search);
        const administrativePatientIds = await findAdministrativePatientIdsByPhone(search);
        where[Op.or] = [
          { nombres: { [Op.iLike]: `%${search}%` } },
          { apellidos: { [Op.iLike]: `%${search}%` } },
          { ci: { [Op.iLike]: `%${search}%` } },
          { numero_documento: { [Op.iLike]: `%${search}%` } },
          { numero_documento_normalizado: { [Op.iLike]: `%${normalizePatientDocument(search)}%` } },
          { telefono: { [Op.iLike]: `%${search}%` } },
          ...(normalizedPhone ? [{ telefono_normalizado: { [Op.iLike]: `%${normalizedPhone}%` } }] : []),
          ...(administrativePatientIds.length ? [{ id: { [Op.in]: administrativePatientIds } }] : []),
          Paciente.sequelize.where(
            Paciente.sequelize.fn(
              'concat',
              Paciente.sequelize.col('nombres'),
              ' ',
              Paciente.sequelize.col('apellidos')
            ),
            { [Op.iLike]: `%${search}%` }
          )
        ];
      }

      const [{ rows, count }, activos, inactivos] = await Promise.all([
        Paciente.findAndCountAll({
          where,
          attributes: ['id', 'nombres', 'apellidos', 'ci', 'tipo_documento', 'numero_documento', 'nombre_documento_otro', 'fecha_nacimiento', 'telefono', 'foto', 'edad', 'sexo', 'estado'],
          order: [['id', 'DESC']],
          limit,
          offset: (page - 1) * limit
        }),
        Paciente.count({ where: { estado: true, registro_pendiente: false } }),
        Paciente.count({ where: { estado: false, registro_pendiente: false } })
      ]);
      return res.json({
        items: await patientDtosWithAdministrativePhone(rows),
        total: count,
        summary: { total: activos + inactivos, active: activos, inactive: inactivos },
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      });
    }

    const pacientes = await Paciente.findAll({ order: [['id', 'DESC']], limit: 500 });
    return res.json(await patientDtosWithAdministrativePhone(pacientes));
  } catch (error) {
    return next(error);
  }
};

const listarPendientesWhatsapp = async (_req, res, next) => {
  try {
    const patients = await Paciente.findAll({ where: { registro_pendiente: true, estado: true }, order: [['created_at', 'ASC']] });
    const rows = await Promise.all(patients.map(async (patient) => {
      const [referral, appointment, request] = await Promise.all([
        WhatsappReceptionReferral.findOne({ where: { paciente_id: patient.id, tipo_derivacion: 'REGISTRO_PACIENTE' }, order: [['created_at', 'DESC']] }),
        Cita.findOne({ where: { paciente_id: patient.id, estado: { [Op.in]: ['Pendiente', 'Programada', 'Confirmada'] } }, order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']] }),
        WhatsappSolicitudCita.findOne({ where: { paciente_id: patient.id, tipo_solicitud: 'AGENDAR' }, order: [['created_at', 'DESC']] })
      ]);
      return { id: referral ? Number(referral.id) : null, patient_id: patient.id, estado: referral?.estado || 'PENDIENTE', nombre: `${patient.nombres || ''} ${patient.apellidos || ''}`.trim(), telefono: patient.telefono, motivo: request?.motivo || appointment?.motivo, fecha: appointment?.fecha || request?.fecha_solicitada, hora_inicio: appointment?.hora_inicio ? String(appointment.hora_inicio).slice(0, 5) : request?.hora_inicio ? String(request.hora_inicio).slice(0, 5) : null, hora_fin: appointment?.hora_fin ? String(appointment.hora_fin).slice(0, 5) : request?.hora_fin ? String(request.hora_fin).slice(0, 5) : null };
    }));
    return res.json(rows);
  } catch (error) { return next(error); }
};

const validarDuplicados = async (req, res, next) => {
  try {
    const tipoDocumento = normalizeDocumentType(req.query.tipo_documento) || (req.query.ci ? 'CI' : null);
    const numeroDocumento = cleanDocumentText(req.query.numero_documento) || cleanDocumentText(req.query.ci);
    const numeroNormalizado = normalizePatientDocument(numeroDocumento);
    const excludeId = Number.parseInt(req.query.excludeId, 10) || null;
    if (!tipoDocumento || !numeroNormalizado) return res.status(400).json({ message: 'El documento es obligatorio.' });

    const excludeWhere = excludeId ? { id: { [Op.ne]: excludeId } } : {};
    const exacto = await Paciente.findOne({
      where: { ...excludeWhere, tipo_documento: tipoDocumento, numero_documento_normalizado: numeroNormalizado },
      attributes: ['id', 'nombres', 'apellidos', 'ci', 'tipo_documento', 'numero_documento', 'nombre_documento_otro', 'telefono', 'estado']
    });

    const posibles = [];
    const nombres = textoLimpio(req.query.nombres);
    const apellidos = textoLimpio(req.query.apellidos);
    const telefono = textoLimpio(req.query.telefono);
    const fechaNacimiento = textoLimpio(req.query.fecha_nacimiento);
    const condiciones = [];
    if (telefono) condiciones.push({ telefono });
    if (nombres && apellidos) {
      condiciones.push({
        [Op.and]: [
          { nombres: { [Op.iLike]: nombres } },
          { apellidos: { [Op.iLike]: apellidos } }
        ]
      });
    }
    if (fechaNacimiento && nombres) {
      condiciones.push({
        [Op.and]: [
          { fecha_nacimiento: fechaNacimiento },
          { nombres: { [Op.iLike]: nombres } }
        ]
      });
    }
    if (condiciones.length) {
      posibles.push(...await Paciente.findAll({
        where: {
          ...excludeWhere,
          ...(exacto ? { id: { [Op.notIn]: [exacto.id, ...(excludeId ? [excludeId] : [])] } } : {}),
          [Op.or]: condiciones
        },
        attributes: ['id', 'nombres', 'apellidos', 'ci', 'tipo_documento', 'numero_documento', 'nombre_documento_otro', 'telefono', 'estado'],
        order: [['id', 'DESC']],
        limit: 5
      }));
    }

    return res.json({ exacto, similares: posibles });
  } catch (error) {
    return next(error);
  }
};

const obtenerPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    return res.json(await patientDtoWithAdministrativePhone(paciente));
  } catch (error) {
    return next(error);
  }
};

const obtenerSeccionPaciente = async (req, res, next) => {
  try {
    const pacienteId = Number.parseInt(req.params.id, 10);
    const seccion = String(req.params.seccion || '').toLowerCase();
    if (!Number.isInteger(pacienteId) || pacienteId <= 0) {
      return res.status(400).json({ message: 'Paciente no válido.' });
    }
    if (!await Paciente.findByPk(pacienteId, { attributes: ['id'] })) {
      return res.status(404).json({ message: 'Paciente no encontrado.' });
    }

    if (seccion === 'historias') {
      const items = await HistoriaClinica.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: EvaluacionFinal, as: 'evaluacion_final', attributes: ['sesiones_contratadas'] },
          { model: Usuario, as: 'usuario', attributes: ['id', 'nombre'] }
        ],
        order: [['anulada', 'ASC'], ['fecha_evaluacion', 'DESC'], ['id', 'DESC']]
      });
      return res.json({ items });
    }

    if (seccion === 'sesiones') {
      const items = await Sesion.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: HistoriaClinica, as: 'historia_clinica', attributes: ['id', 'diagnostico_medico', 'estado', 'anulada'] },
          { model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre'] }
        ],
        order: [['fecha', 'DESC'], ['numero_sesion', 'DESC'], ['id', 'DESC']]
      });
      return res.json({ items });
    }

    if (seccion === 'citas') {
      const items = await Cita.findAll({
        where: { paciente_id: pacienteId },
        include: [
          { model: Usuario, as: 'profesional', attributes: ['id', 'nombre'] },
          { model: Usuario, as: 'registrado_por', attributes: ['id', 'nombre'] }
        ],
        order: [['fecha', 'DESC'], ['hora_inicio', 'DESC'], ['id', 'DESC']]
      });
      return res.json({ items });
    }

    if (seccion === 'pagos') {
      if (req.usuario?.rol !== 'admin') {
        return res.status(403).json({ message: 'La información financiera es exclusiva del Administrador.' });
      }
      const conceptos = await ConceptoCobro.findAll({
        where: { paciente_id: pacienteId },
        include: [{
          model: MovimientoPago,
          as: 'movimientos',
          required: false,
          include: [{ model: Usuario, as: 'recibido_por', attributes: ['id', 'nombre'] }]
        }],
        order: [['fecha_origen', 'DESC'], ['id', 'DESC']]
      });
      const items = conceptos.map((model) => {
        const item = model.toJSON();
        const movimientos = (item.movimientos || []).filter((movimiento) => movimiento.estado === 'Activo');
        const totalPagado = movimientos.reduce((total, movimiento) => total + Number(movimiento.monto || 0), 0);
        return {
          ...item,
          movimientos,
          total_pagado: Number(totalPagado.toFixed(2)),
          saldo_pendiente: Number(Math.max(Number(item.monto_esperado || 0) - totalPagado, 0).toFixed(2))
        };
      });
      return res.json({
        items,
        resumen: {
          total_esperado: items.reduce((total, item) => total + Number(item.monto_esperado || 0), 0),
          total_pagado: items.reduce((total, item) => total + item.total_pagado, 0),
          saldo_pendiente: items.reduce((total, item) => total + item.saldo_pendiente, 0),
          conceptos_pendientes: items.filter((item) => item.saldo_pendiente > 0 && item.activo).length
        }
      });
    }

    return res.status(400).json({ message: 'Sección de paciente no válida.' });
  } catch (error) {
    return next(error);
  }
};

const crearPaciente = async (req, res, next) => {
  try {
    const data = normalizarPaciente(req.body);
    const referralId = Number.parseInt(req.body.whatsapp_derivacion_id, 10) || null;
    let hasAdministrativeContact = false;
    if (referralId && isMinorByBirthDate(data.fecha_nacimiento)) {
      const pendingReferral = await WhatsappReceptionReferral.findByPk(referralId, { attributes: ['paciente_id'] });
      hasAdministrativeContact = Boolean(pendingReferral?.paciente_id && await resolveAdministrativePhone(pendingReferral.paciente_id));
    }
    const errorValidacion = validarPaciente(data, { hasAdministrativeContact });
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarDocumentoUnico(data.tipo_documento, data.numero_documento_normalizado))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (!(await validarCiUnico(data.ci))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (!referralId && !(await validarTelefonoUnico(data.telefono_normalizado))) {
      return res.status(409).json({ message: PHONE_DUPLICATE_MESSAGE });
    }
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    if (!referralId) {
      const paciente = await Paciente.create({ ...data, estado: true });
      return res.status(201).json(paciente);
    }
    const result = await Paciente.sequelize.transaction(async (transaction) => {
      const referral = await WhatsappReceptionReferral.findByPk(referralId, { include: [{ model: WhatsappSolicitudCita, as: 'solicitud', required: true }], transaction, lock: transaction.LOCK.UPDATE });
      if (!referral || referral.tipo_derivacion !== 'REGISTRO_PACIENTE' || !['PENDIENTE', 'EN_ATENCION'].includes(referral.estado)) throw Object.assign(new Error('La solicitud pendiente ya no está disponible.'), { status: 409 });
      if (normalizePhoneNumber(referral.telefono_normalizado) !== data.telefono_normalizado) throw Object.assign(new Error('El teléfono debe coincidir con la solicitud de WhatsApp.'), { status: 400 });
      const created = referral.paciente_id ? await Paciente.findByPk(referral.paciente_id, { transaction, lock: transaction.LOCK.UPDATE }) : null;
      if (!created || created.registro_pendiente !== true) throw Object.assign(new Error('No encontramos el paciente temporal vinculado.'), { status: 409 });
      await created.update({ ...data, estado: true, registro_pendiente: false }, { transaction });
      const request = referral.solicitud;
      let appointment = null;
      if (request.fecha_solicitada && request.hora_inicio && request.hora_fin && !request.cita_id) {
        await Paciente.sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:slotKey))', { replacements: { slotKey: `whatsapp-appointment:${request.fecha_solicitada}` }, transaction });
        const free = await appointmentAvailability.revalidateSlotCapacity({ slot: { date: request.fecha_solicitada, start: String(request.hora_inicio).slice(0, 5), end: String(request.hora_fin).slice(0, 5) }, appointmentModel: Cita, transaction, now: new Date() });
        if (!free) throw Object.assign(new Error('El horario solicitado ya no está disponible. Selecciona otro horario antes de registrar al paciente.'), { status: 409 });
        appointment = await Cita.create({ paciente_id: created.id, usuario_id: null, fecha: request.fecha_solicitada, hora_inicio: request.hora_inicio, hora_fin: request.hora_fin, motivo: request.motivo ? String(request.motivo).slice(0, 255) : null, tipo_atencion: 'Sesion de fisioterapia', estado: 'Pendiente', observacion: null, profesional_id: null, historia_clinica_id: null, sesion_id: null, numero_sesion: null, total_sesiones: null, origen: 'WhatsApp', historial_programacion: [] }, { transaction });
      }
      await request.update({ paciente_id: created.id, cita_id: appointment?.id || request.cita_id, estado: appointment ? 'CONFIRMADA' : request.estado, paso_actual: appointment ? 'CITA_CREADA' : request.paso_actual }, { transaction });
      await referral.update({ paciente_id: created.id, cita_id: appointment?.id || referral.cita_id, estado: 'RESUELTA', resolucion: 'Paciente registrado desde solicitud de WhatsApp', resuelta_en: new Date() }, { transaction });
      return { paciente: created, appointmentId: appointment?.id || null };
    });
    if (result.appointmentId) await syncAppointmentById(result.appointmentId);
    return res.status(201).json(result.paciente);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (isDocumentUniqueConstraintError(error)) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (isPhoneUniqueConstraintError(error)) return res.status(409).json({ message: PHONE_DUPLICATE_MESSAGE });
    return next(error);
  }
};

const crearPacienteConContactos = async (req, res, next) => {
  try {
    const patientBody = req.body.paciente || {};
    const contacts = Array.isArray(req.body.contactos) ? req.body.contactos : [];
    const data = normalizarPaciente(patientBody);
    const isMinor = isMinorByBirthDate(data.fecha_nacimiento);
    const result = await Paciente.sequelize.transaction(async (transaction) => {
      let principalProvided = false;
      let validPrincipal = false;
      for (const item of contacts) {
        const relation = item.relacion || item;
        if (!relation.es_contacto_principal) continue;
        principalProvided = true;
        if (item.contacto_id) {
          const existing = await Contacto.findByPk(Number(item.contacto_id), { transaction });
          validPrincipal = Boolean(existing?.estado && normalizePhoneNumber(existing.telefono));
        } else if (item.contacto) {
          validPrincipal = Boolean(normalizePhoneNumber(item.contacto.telefono));
        }
        if (validPrincipal) break;
      }
      if (isMinor && !principalProvided) throw Object.assign(new Error('Debe seleccionar un responsable principal para el paciente menor.'), { status: 400 });
      if (isMinor && !validPrincipal) throw Object.assign(new Error('El responsable principal debe tener un teléfono válido.'), { status: 400 });
      const validationError = validarPaciente(data, { hasAdministrativeContact: validPrincipal });
      if (validationError) throw Object.assign(new Error(validationError), { status: 400 });
      if (!(await validarDocumentoUnico(data.tipo_documento, data.numero_documento_normalizado))) throw Object.assign(new Error('Ya existe un paciente registrado con ese documento.'), { status: 409 });
      if (!(await validarCiUnico(data.ci))) throw Object.assign(new Error('Ya existe un paciente registrado con ese documento.'), { status: 409 });
      if (!(await validarTelefonoUnico(data.telefono_normalizado))) throw Object.assign(new Error(PHONE_DUPLICATE_MESSAGE), { status: 409 });
      const imageError = validarImagen(data.foto);
      if (imageError) throw Object.assign(new Error(imageError), { status: 400 });

      const patient = await Paciente.create({ ...data, estado: true }, { transaction });
      for (const item of contacts) {
        const relationBody = item.relacion || item;
        let contactId = Number(item.contacto_id) || null;
        if (!contactId) {
          if (!item.contacto) throw Object.assign(new Error('Los datos del responsable son obligatorios.'), { status: 400 });
          const contact = await contactoService.create({ body: item.contacto, userId: req.usuario.id, transaction });
          contactId = contact.id;
        }
        await pacienteContactoService.create({ patientId: patient.id, contactId, body: relationBody, userId: req.usuario.id, transaction });
      }
      const administrative = await resolveAdministrativePhone(patient, { transaction });
      if (isMinor && !administrative) throw Object.assign(new Error('El responsable principal debe tener un teléfono válido.'), { status: 400 });
      return patient;
    });
    return res.status(201).json(await patientDtoWithAdministrativePhone(result));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (isDocumentUniqueConstraintError(error)) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (isPhoneUniqueConstraintError(error)) return res.status(409).json({ message: PHONE_DUPLICATE_MESSAGE });
    return next(error);
  }
};

const actualizarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const data = normalizarPaciente(req.body);
    const completo = { ...paciente.toJSON(), ...data };
    const isMinor = isMinorByBirthDate(completo.fecha_nacimiento);
    const administrative = isMinor ? await resolveAdministrativePhone({ ...completo, id: paciente.id }) : null;
    const errorValidacion = validarPaciente(completo, { hasAdministrativeContact: Boolean(administrative) });
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarDocumentoUnico(completo.tipo_documento, completo.numero_documento_normalizado, paciente.id))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (!(await validarCiUnico(completo.ci, paciente.id))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    const telefonoNormalizado = normalizePhoneNumber(completo.telefono) || null;
    data.telefono_normalizado = telefonoNormalizado;
    if (!(await validarTelefonoUnico(telefonoNormalizado, paciente.id))) {
      return res.status(409).json({ message: PHONE_DUPLICATE_MESSAGE });
    }
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    await paciente.update(data);
    return res.json(await patientDtoWithAdministrativePhone(paciente));
  } catch (error) {
    if (isDocumentUniqueConstraintError(error)) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese documento.' });
    if (isPhoneUniqueConstraintError(error)) return res.status(409).json({ message: PHONE_DUPLICATE_MESSAGE });
    return next(error);
  }
};

const eliminarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    if (!paciente.estado) return res.json({ message: 'El paciente ya estaba inactivo.', paciente });
    await paciente.update({ estado: false });
    return res.json({ message: 'Paciente desactivado correctamente.', paciente });
  } catch (error) {
    return next(error);
  }
};

const reactivarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    if (paciente.estado) return res.json({ message: 'El paciente ya estaba activo.', paciente });
    await paciente.update({ estado: true });
    return res.json({ message: 'Paciente reactivado correctamente.', paciente });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  listarPacientes,
  listarPendientesWhatsapp,
  validarDuplicados,
  obtenerPaciente,
  obtenerSeccionPaciente,
  crearPaciente,
  crearPacienteConContactos,
  actualizarPaciente,
  eliminarPaciente,
  reactivarPaciente,
  normalizarPaciente,
  validarPaciente,
  findAdministrativePatientIdsByPhone,
  validarDocumentoUnico,
  validarTelefonoUnico,
  isPhoneUniqueConstraintError,
  PHONE_DUPLICATE_MESSAGE,
  PHONE_INVALID_MESSAGE
};
