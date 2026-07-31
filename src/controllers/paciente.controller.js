const { Op } = require('sequelize');
const {
  Cita,
  ConceptoCobro,
  EvaluacionFinal,
  HistoriaClinica,
  MovimientoPago,
  Paciente,
  Sesion,
  Usuario
} = require('../models');
const { validarImagen } = require('../utils/imagen');
const { boliviaDate } = require('../utils/boliviaDateTime');

const camposPaciente = [
  'nombres', 'apellidos', 'ci', 'fecha_nacimiento', 'lugar_nacimiento',
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

const validarPaciente = (data) => {
  if (!data.nombres) return 'Los nombres son obligatorios.';
  if (!data.apellidos) return 'Los apellidos son obligatorios.';
  if (!data.ci) return 'El CI es obligatorio.';
  if (!data.telefono) return 'El teléfono es obligatorio.';
  if (!data.sexo) return 'El sexo es obligatorio.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.nombres)) return 'Los nombres no pueden contener números.';
  if (!/^[A-ZÁÉÍÓÚÜÑ' -]+$/iu.test(data.apellidos)) return 'Los apellidos no pueden contener números.';
  if (!/^\d+$/.test(data.ci)) return 'El CI solo puede contener números.';
  if (!/^\d{7,8}$/.test(data.telefono)) return 'El teléfono debe tener 7 u 8 dígitos.';
  if (!['MASCULINO', 'FEMENINO'].includes(data.sexo)) return 'Selecciona MASCULINO o FEMENINO.';
  if (data.fecha_nacimiento && data.fecha_nacimiento > boliviaDate()) return 'La fecha de nacimiento no puede ser futura.';
  if (data.peso !== null && data.peso !== undefined && (!Number.isFinite(data.peso) || data.peso <= 0)) return 'El peso debe ser mayor que cero.';
  if (data.talla !== null && data.talla !== undefined && (!Number.isFinite(data.talla) || data.talla <= 0)) return 'La talla debe ser mayor que cero.';
  return null;
};

const validarCiUnico = async (ci, id = null) => {
  const where = { ci };
  if (id) where.id = { [Op.ne]: id };
  return !(await Paciente.findOne({ where, attributes: ['id'] }));
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
      const where = {};

      if (estado === 'active') where.estado = true;
      if (estado === 'inactive') where.estado = false;
      if (['MASCULINO', 'FEMENINO'].includes(sexo)) where.sexo = sexo;
      if (search) {
        where[Op.or] = [
          { nombres: { [Op.iLike]: `%${search}%` } },
          { apellidos: { [Op.iLike]: `%${search}%` } },
          { ci: { [Op.iLike]: `%${search}%` } },
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
          attributes: ['id', 'nombres', 'apellidos', 'ci', 'telefono', 'foto', 'edad', 'sexo', 'estado'],
          order: [['id', 'DESC']],
          limit,
          offset: (page - 1) * limit
        }),
        Paciente.count({ where: { estado: true } }),
        Paciente.count({ where: { estado: false } })
      ]);
      return res.json({
        items: rows,
        total: count,
        summary: { total: activos + inactivos, active: activos, inactive: inactivos },
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      });
    }

    const pacientes = await Paciente.findAll({ order: [['id', 'DESC']], limit: 500 });
    return res.json(pacientes);
  } catch (error) {
    return next(error);
  }
};

const validarDuplicados = async (req, res, next) => {
  try {
    const ci = textoLimpio(req.query.ci);
    const excludeId = Number.parseInt(req.query.excludeId, 10) || null;
    if (!ci) return res.status(400).json({ message: 'El CI es obligatorio.' });

    const excludeWhere = excludeId ? { id: { [Op.ne]: excludeId } } : {};
    const exacto = await Paciente.findOne({
      where: { ...excludeWhere, ci },
      attributes: ['id', 'nombres', 'apellidos', 'ci', 'telefono', 'estado']
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
        attributes: ['id', 'nombres', 'apellidos', 'ci', 'telefono', 'estado'],
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
    return res.json(paciente);
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
    const errorValidacion = validarPaciente(data);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarCiUnico(data.ci))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese CI.' });
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    const paciente = await Paciente.create({ ...data, estado: true });
    return res.status(201).json(paciente);
  } catch (error) {
    return next(error);
  }
};

const actualizarPaciente = async (req, res, next) => {
  try {
    const paciente = await Paciente.findByPk(req.params.id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado.' });
    const data = normalizarPaciente(req.body);
    const completo = { ...paciente.toJSON(), ...data };
    const errorValidacion = validarPaciente(completo);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });
    if (!(await validarCiUnico(completo.ci, paciente.id))) return res.status(409).json({ message: 'Ya existe un paciente registrado con ese CI.' });
    const errorImagen = validarImagen(data.foto);
    if (errorImagen) return res.status(400).json({ message: errorImagen });

    await paciente.update(data);
    return res.json(paciente);
  } catch (error) {
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
  validarDuplicados,
  obtenerPaciente,
  obtenerSeccionPaciente,
  crearPaciente,
  actualizarPaciente,
  eliminarPaciente,
  reactivarPaciente
};
