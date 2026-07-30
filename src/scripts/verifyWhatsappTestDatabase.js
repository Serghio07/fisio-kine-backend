const path = require('path');

const envArgument = process.argv.find((argument) => argument.startsWith('--env='));
const envFile = envArgument?.slice('--env='.length);
if (!envFile) {
  console.error('Debes indicar --env=.env.whatsapp-test');
  process.exit(1);
}
require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });

if (process.env.WHATSAPP_TEST_DATABASE !== 'true' || !/test/i.test(process.env.DB_NAME || '')) {
  console.error('Verificacion cancelada: el entorno no corresponde a una base de prueba.');
  process.exit(1);
}

const jwt = require('jsonwebtoken');
const app = require('../app');
const {
  sequelize,
  Cita,
  Paciente,
  Usuario
} = require('../models');

const checks = [];

const checkEndpoint = async (baseUrl, route, token, expected = 200, options = {}) => {
  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method || 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  checks.push({ check: route, status: response.status, ok: response.status === expected });
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${route} devolvio ${response.status}: ${body.slice(0, 200)}`);
  }
};

const run = async () => {
  let server;
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET de prueba es obligatorio para verificar las rutas');
    }
    await sequelize.authenticate();
    const usuario = await Usuario.findOne({ where: { estado: 'activo', activo: true } });
    const paciente = await Paciente.findOne();
    if (!usuario || !paciente) throw new Error('La copia de prueba no contiene usuario activo o paciente');

    const token = jwt.sign(
      { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol, estado: usuario.estado },
      process.env.JWT_SECRET,
      { expiresIn: '5m', algorithm: 'HS256' }
    );

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    await checkEndpoint(baseUrl, '/api/health', null);
    await checkEndpoint(baseUrl, '/api/auth/login', null, 400, { method: 'POST', body: {} });
    await checkEndpoint(baseUrl, '/api/pacientes', token);
    await checkEndpoint(baseUrl, '/api/historias-clinicas', token);
    await checkEndpoint(baseUrl, '/api/citas', token);
    await checkEndpoint(baseUrl, '/api/sesiones', token);
    await checkEndpoint(baseUrl, '/api/planilla-pagos', token);
    await checkEndpoint(baseUrl, '/api/dashboard/resumen', token);

    const transaction = await sequelize.transaction();
    try {
      await Cita.create({
        paciente_id: paciente.id,
        usuario_id: usuario.id,
        profesional_id: usuario.id,
        fecha: '2099-12-30',
        hora_inicio: '08:00:00',
        hora_fin: '08:30:00',
        tipo_atencion: 'Control',
        estado: 'Pendiente',
        origen: 'Agenda manual',
        canal_origen: 'SISTEMA_INTERNO',
        estado_confirmacion: 'PENDIENTE'
      }, { transaction });
      checks.push({ check: 'cita_manual_transaction', status: 'created_then_rolled_back', ok: true });
    } finally {
      await transaction.rollback();
    }

    console.log(JSON.stringify({ database: process.env.DB_NAME, checks }, null, 2));
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }
};

run().catch((error) => {
  console.error('Verificacion de base de prueba fallida:', error.message);
  process.exitCode = 1;
});
