const { Op } = require('sequelize');
const { HistoriaClinica, Paciente, RegistroSemanal, Sesion, Usuario, sequelize } = require('../models');
const { ensureRegistroSemanalSchema } = require('../services/registroSemanalSchema.service');
const { construirResumen, sincronizarSemana } = require('../services/sesionSemanalSync.service');
const { enrichRecordsWithAdministrativePhone } = require('../services/patientAdministrativeContact.service');

const includeRegistroSemanal = [
  { model: Paciente, as: 'paciente' },
  { model: HistoriaClinica, as: 'historia_clinica' }
];

const pagoHistoriaKey = (pacienteId, historiaClinicaId) => `${pacienteId}:${historiaClinicaId}`;

const agregarPagosSemana = (registros, pagos = []) => {
  const pagosPorHistoria = new Map(pagos.map((pago) => [
    pagoHistoriaKey(pago.paciente_id, pago.historia_clinica_id),
    Number(pago.pagado_en_semana || 0)
  ]));
  return registros.map((registro) => {
    const data = typeof registro?.toJSON === 'function' ? registro.toJSON() : registro;
    return {
      ...data,
      pagado_en_semana: pagosPorHistoria.get(pagoHistoriaKey(data.paciente_id, data.historia_clinica_id)) || 0
    };
  });
};

const obtenerPagosSemana = async (fechaInicio, fechaFin, transaction = null) => {
  if (!fechaInicio || !fechaFin) return [];
  const [pagos] = await sequelize.query(`
    SELECT c.paciente_id, c.historia_clinica_id,
      COALESCE(SUM(m.monto), 0)::numeric AS pagado_en_semana
    FROM movimientos_pago m
    INNER JOIN conceptos_cobro c ON c.id = m.concepto_cobro_id
    WHERE m.estado = 'Activo'
      AND m.fecha BETWEEN :fechaInicio AND :fechaFin
      AND c.activo = TRUE
      AND c.historia_clinica_id IS NOT NULL
    GROUP BY c.paciente_id, c.historia_clinica_id
  `, { replacements: { fechaInicio, fechaFin }, transaction });
  return pagos;
};

const validar = (body) => {
  if (!body.paciente_id) return 'paciente_id es requerido';
  if (!body.semana_inicio) return 'semana_inicio es requerida';
  if (!body.semana_fin) return 'semana_fin es requerida';
  if (body.debe_bs !== undefined && Number(body.debe_bs || 0) < 0) return 'debe_bs no puede ser negativo';
  return null;
};

const normalizar = (body) => ({
  semana_inicio: body.semana_inicio,
  semana_fin: body.semana_fin,
  paciente_id: body.paciente_id,
  historia_clinica_id: body.historia_clinica_id || null,
  diagnostico: body.diagnostico,
  telefono: body.telefono,
  edad: body.edad === '' || body.edad === null ? null : Number(body.edad || 0),
  sexo: body.sexo || null,
  lunes: body.lunes,
  martes: body.martes,
  miercoles: body.miercoles,
  jueves: body.jueves,
  viernes: body.viernes,
  sabado: body.sabado,
  debe_bs: body.debe_bs === '' || body.debe_bs === null ? 0 : Number(body.debe_bs || 0),
  observacion: body.observacion
});

const listarRegistros = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const where = {
      total_sesiones: { [Op.gt]: 0 },
      sincronizado_sesiones: true
    };
    if (req.query.fecha_inicio && req.query.fecha_fin) {
      where.semana_inicio = { [Op.lte]: req.query.fecha_fin };
      where.semana_fin = { [Op.gte]: req.query.fecha_inicio };
    } else {
      if (req.query.semana_inicio) where.semana_inicio = req.query.semana_inicio;
      if (req.query.semana_fin) where.semana_fin = req.query.semana_fin;
    }

    const registros = await RegistroSemanal.findAll({
      where,
      include: includeRegistroSemanal,
      order: [['semana_inicio', 'DESC'], ['id', 'DESC']]
    });

    const sesiones = req.query.fecha_inicio && req.query.fecha_fin
      ? await Sesion.findAll({
        where: {
          fecha: { [Op.between]: [req.query.fecha_inicio, req.query.fecha_fin] },
          anulada: false
        },
        include: [{ model: Usuario, as: 'registrado_por', attributes: ['nombre'] }],
        order: [['fecha', 'ASC'], ['numero_sesion', 'ASC'], ['id', 'ASC']]
      })
      : [];

    const respuesta = registros.filter((registro) => (
      registro.historia_clinica
      && !registro.historia_clinica.anulada
      && !['anulada', 'inactiva'].includes(registro.historia_clinica.estado)
    )).map((registro) => {
      const data = registro.toJSON();
      const sesionesRegistro = sesiones.filter((sesion) => (
        Number(sesion.paciente_id) === Number(registro.paciente_id)
        && String(sesion.historia_clinica_id || '') === String(registro.historia_clinica_id || '')
        && sesion.fecha >= registro.semana_inicio
        && sesion.fecha <= registro.semana_fin
      ));
      const evolutivos = Array.isArray(data.historia_clinica?.evolutivo) ? data.historia_clinica.evolutivo : [];
      const sesionesConEvolutivo = sesionesRegistro.map((sesionModel) => {
        const sesion = sesionModel.toJSON();
        const evolutivo = evolutivos.find((item) => String(item.sesion_id || '') === String(sesion.id)) || {};
        return {
          ...sesion,
          dolor_antes: sesion.dolor_antes ?? evolutivo.dolor_inicial ?? null,
          dolor_despues: sesion.dolor_despues ?? evolutivo.dolor_final ?? null,
          descripcion_tratamiento: sesion.descripcion_tratamiento || evolutivo.descripcion_tratamiento || evolutivo.procedimiento_realizado || null,
          evolucion_observada: sesion.evolucion_observada || evolutivo.evolucion_observada || null,
          observacion: sesion.observacion || evolutivo.observaciones || null,
          inyectable_nombre: sesion.inyectable_nombre || evolutivo.inyectable_nombre || evolutivo.inyectables || null,
          inyectable_dosis: sesion.inyectable_dosis || evolutivo.inyectable_dosis || null,
          profesional_responsable: sesion.profesional_responsable || evolutivo.profesional_responsable || sesion.registrado_por?.nombre || null
        };
      });
      return req.query.fecha_inicio && req.query.fecha_fin
        ? { ...data, sesiones_resumen: construirResumen(sesionesConEvolutivo), total_sesiones: sesionesConEvolutivo.length }
        : data;
    });
    const respuestaFinanciera = req.usuario.rol === 'admin' && req.query.fecha_inicio && req.query.fecha_fin
      ? agregarPagosSemana(respuesta, await obtenerPagosSemana(req.query.fecha_inicio, req.query.fecha_fin))
      : respuesta;
    return res.json(await enrichRecordsWithAdministrativePhone(respuestaFinanciera));
  } catch (error) {
    return next(error);
  }
};

const obtenerRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const registro = await RegistroSemanal.findByPk(req.params.id, { include: includeRegistroSemanal });
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });
    return res.json(await enrichRecordsWithAdministrativePhone(registro));
  } catch (error) {
    return next(error);
  }
};

const crearRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const errorValidacion = validar(req.body);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    const paciente = await Paciente.findByPk(req.body.paciente_id);
    if (!paciente) return res.status(404).json({ message: 'Paciente no encontrado' });

    const existente = await RegistroSemanal.findOne({
      where: {
        paciente_id: req.body.paciente_id,
        semana_inicio: req.body.semana_inicio,
        historia_clinica_id: req.body.historia_clinica_id || null
      },
      order: [['id', 'ASC']]
    });

    if (existente) {
      await existente.update({
        ...normalizar(req.body),
        aplica_farmacos: existente.aplica_farmacos,
        generado_automaticamente: false
      });
      const completoExistente = await RegistroSemanal.findByPk(existente.id, { include: includeRegistroSemanal });
      return res.json(await enrichRecordsWithAdministrativePhone(completoExistente));
    }

    const registro = await RegistroSemanal.create({
      ...normalizar(req.body),
      aplica_farmacos: false,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includeRegistroSemanal });
    return res.status(201).json(await enrichRecordsWithAdministrativePhone(completo));
  } catch (error) {
    return next(error);
  }
};

const actualizarRegistro = async (req, res, next) => {
  try {
    await ensureRegistroSemanalSchema();
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    const payload = normalizar({ ...registro.toJSON(), ...req.body });
    const errorValidacion = validar(payload);
    if (errorValidacion) return res.status(400).json({ message: errorValidacion });

    await registro.update({
      ...payload,
      aplica_farmacos: registro.aplica_farmacos,
      generado_automaticamente: false
    });
    const completo = await RegistroSemanal.findByPk(registro.id, { include: includeRegistroSemanal });
    return res.json(await enrichRecordsWithAdministrativePhone(completo));
  } catch (error) {
    return next(error);
  }
};

const eliminarRegistro = async (req, res, next) => {
  try {
    const registro = await RegistroSemanal.findByPk(req.params.id);
    if (!registro) return res.status(404).json({ message: 'Registro semanal no encontrado' });

    await registro.destroy();
    return res.json({ message: 'Registro semanal eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};

const recalcularSemana = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    await ensureRegistroSemanalSchema(transaction);
    const semanaInicio = req.body?.fecha_inicio || req.query.fecha_inicio || req.body?.semana_inicio || req.query.semana_inicio;
    const semanaFin = req.body?.fecha_fin || req.query.fecha_fin || req.body?.semana_fin || req.query.semana_fin;
    if (!semanaInicio || !semanaFin) {
      await transaction.rollback();
      return res.status(400).json({ message: 'fecha_inicio y fecha_fin son requeridas' });
    }

    const sesiones = await Sesion.findAll({
      attributes: ['paciente_id', 'fecha'],
      where: {
        fecha: { [Op.between]: [semanaInicio, semanaFin] },
        anulada: false
      },
      order: [['fecha', 'ASC'], ['id', 'ASC']],
      transaction
    });

    const procesadas = new Set();
    for (const sesion of sesiones) {
      const key = `${sesion.paciente_id}:${sesion.fecha}`;
      if (procesadas.has(key)) continue;
      await sincronizarSemana(sesion.paciente_id, sesion.fecha, transaction);
      procesadas.add(key);
    }

    await transaction.commit();

    const registros = await RegistroSemanal.findAll({
      where: {
        semana_inicio: { [Op.lte]: semanaFin },
        semana_fin: { [Op.gte]: semanaInicio },
        total_sesiones: { [Op.gt]: 0 },
        sincronizado_sesiones: true
      },
      include: includeRegistroSemanal,
      order: [['id', 'DESC']]
    });

    const respuestaFinanciera = req.usuario.rol === 'admin'
      ? agregarPagosSemana(registros, await obtenerPagosSemana(semanaInicio, semanaFin))
      : registros;
    return res.json({
      message: 'Resumen actualizado desde sesiones diarias',
      total: registros.length,
      registros: await enrichRecordsWithAdministrativePhone(respuestaFinanciera)
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return next(error);
  }
};

module.exports = {
  listarRegistros,
  obtenerRegistro,
  crearRegistro,
  actualizarRegistro,
  eliminarRegistro,
  recalcularSemana,
  agregarPagosSemana,
  obtenerPagosSemana
};
