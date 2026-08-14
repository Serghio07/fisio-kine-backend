const { ActividadSistema } = require('../models');
const { boliviaDateTime } = require('../utils/boliviaDateTime');

const modulos = {
  pacientes: 'Paciente',
  'historias-clinicas': 'Historia clínica',
  sesiones: 'Sesión',
  'sesiones-semanales': 'Registro semanal',
  'informes-medicos': 'Informe médico',
  'planillas-atencion': 'Planilla de atención',
  'planilla-sesiones': 'Sesión de planilla',
  citas: 'Cita',
  'documentos-clinicos': 'Documento clínico',
  'tareas-personal': 'Tarea extra',
  galeria: 'Galería',
  usuarios: 'Usuario',
  personal: 'Personal',
  'planillas-personal': 'Planilla de personal'
};

const acciones = {
  POST: 'Creó',
  PUT: 'Editó',
  PATCH: 'Cambió',
  DELETE: 'Eliminó'
};

const camposPrivados = /password|contrasena|token|foto|firma|secret/i;
const camposInternosSequelize = new Set([
  '_options', '_previousDataValues', 'dataValues', 'sequelize', 'parent',
  'include', 'includeMap', 'includeNames', 'model', 'transaction', 'request', 'req', 'res'
]);

const datosPlanos = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (value.dataValues && typeof value.get === 'function') return value.get({ plain: true });
  return value;
};

const limpiarDatos = (input, depth = 0, visited = new WeakSet()) => {
  const value = datosPlanos(input);
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 3 || visited.has(value)) return undefined;
  visited.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 20)
      .map((item) => limpiarDatos(item, depth + 1, visited))
      .filter((item) => item !== undefined);
  }
  return Object.entries(value).reduce((result, [key, item]) => {
    if (camposPrivados.test(key) || camposInternosSequelize.has(key)) return result;
    const limpio = limpiarDatos(item, depth + 1, visited);
    if (limpio !== undefined) result[key] = limpio;
    return result;
  }, {});
};

const detalleActividad = (modulo, accion, body) => {
  const nombrePaciente = [body.nombres, body.apellidos].filter(Boolean).join(' ');
  const detalles = {
    Paciente: nombrePaciente ? `${accion} al paciente ${nombrePaciente}${body.ci ? ` (CI: ${body.ci})` : ''}` : `${accion} un paciente`,
    'Historia clínica': `${accion} una historia clínica${body.diagnostico_medico ? `: ${body.diagnostico_medico}` : ''}`,
    Sesión: `${accion} una sesión${body.asistencia ? ` con asistencia "${body.asistencia}"` : ''}${body.observacion ? `: ${body.observacion}` : ''}`,
    Cita: `${accion} una cita${body.tipo_atencion ? ` de ${body.tipo_atencion}` : ''}${body.motivo ? `: ${body.motivo}` : ''}`,
    Galería: `${accion} una imagen de Galería${body.titulo ? `: ${body.titulo}` : ''}`,
    'Informe médico': `${accion} un informe médico${body.diagnostico ? `: ${body.diagnostico}` : ''}`,
    'Documento clínico': `${accion} un documento ${body.tipo || 'clínico'}${body.titulo ? `: ${body.titulo}` : ''}`,
    'Planilla de atención': `${accion} una planilla de atención${body.diagnostico ? `: ${body.diagnostico}` : ''}`,
    'Tarea extra': `${accion} la tarea "${body.titulo || 'Sin título'}"${body.descripcion ? `: ${body.descripcion}` : ''}`,
    Usuario: `${accion} el usuario ${body.usuario || body.nombre || ''}`.trim(),
    Personal: `${accion} el registro de personal ${body.nombres || ''} ${body.apellido_paterno || ''}`.trim()
  };
  return (detalles[modulo] || `${accion} ${modulo.toLowerCase()}`).slice(0, 500);
};

const registrarActividad = (req, res, next) => {
  let respuesta;
  const jsonOriginal = res.json.bind(res);
  res.json = (body) => {
    respuesta = body;
    return jsonOriginal(body);
  };

  res.on('finish', async () => {
    try {
      if (!req.usuario || !acciones[req.method] || res.statusCode >= 400) return;
      const segmento = req.originalUrl.split('?')[0].split('/').filter(Boolean)[1];
      const modulo = modulos[segmento];
      if (!modulo) return;

      const { fecha, hora } = boliviaDateTime();
      const entidad = respuesta?.usuario || respuesta;
      const entidadId = entidad?.id || Number(req.originalUrl.split('?')[0].split('/').filter(Boolean)[2]) || null;
      const pacienteId = req.body?.paciente_id
        || (segmento === 'pacientes' ? entidadId : null);
      const datos = {
        ...(limpiarDatos(entidad || {}) || {}),
        ...(limpiarDatos(req.body || {}) || {})
      };

      await ActividadSistema.create({
        usuario_id: req.usuario.id,
        paciente_id: pacienteId || null,
        entidad_id: entidadId,
        fecha,
        hora,
        modulo,
        accion: acciones[req.method],
        detalle: detalleActividad(modulo, acciones[req.method], datos),
        datos,
        metodo: req.method,
        ruta: req.originalUrl.split('?')[0]
      });
    } catch (error) {
      console.error('No se pudo registrar actividad:', error.message);
    }
  });
  next();
};

module.exports = registrarActividad;
module.exports.limpiarDatos = limpiarDatos;
