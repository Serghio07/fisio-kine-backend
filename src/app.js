const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const usuarioRoutes = require('./routes/usuario.routes');
const pacienteRoutes = require('./routes/paciente.routes');
const historiaClinicaRoutes = require('./routes/historiaClinica.routes');
const sesionRoutes = require('./routes/sesion.routes');
const informeMedicoRoutes = require('./routes/informeMedico.routes');
const registroSemanalRoutes = require('./routes/registroSemanal.routes');
const planillaAtencionRoutes = require('./routes/planillaAtencion.routes');
const planillaSesionRoutes = require('./routes/planillaSesion.routes');
const citaRoutes = require('./routes/cita.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const personalRoutes = require('./routes/personal.routes');
const planillaPersonalRoutes = require('./routes/planillaPersonal.routes');
const tareaPersonalRoutes = require('./routes/tareaPersonal.routes');
const documentoClinicoRoutes = require('./routes/documentoClinico.routes');
const actividadRoutes = require('./routes/actividad.routes');
const planillaPagosRoutes = require('./routes/planillaPagos.routes');
const resumenDiarioRoutes = require('./routes/resumenDiario.routes');
const registrarActividad = require('./middlewares/actividad.middleware');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS'));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan('dev'));
app.use(registrarActividad);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Physio Active API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/pacientes', pacienteRoutes);
app.use('/api/historias-clinicas', historiaClinicaRoutes);
app.use('/api/sesiones', sesionRoutes);
app.use('/api/sesiones-semanales', registroSemanalRoutes);
app.use('/api/informes-medicos', informeMedicoRoutes);
app.use('/api/planillas-atencion', planillaAtencionRoutes);
app.use('/api/planilla-sesiones', planillaSesionRoutes);
app.use('/api/citas', citaRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/personal', personalRoutes);
app.use('/api/planillas-personal', planillaPersonalRoutes);
app.use('/api/tareas-personal', tareaPersonalRoutes);
app.use('/api/documentos-clinicos', documentoClinicoRoutes);
app.use('/api/actividades', actividadRoutes);
app.use('/api/planilla-pagos', planillaPagosRoutes);
app.use('/api/resumen-diario', resumenDiarioRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({
      message: 'Error de validacion',
      errors: error.errors.map((item) => item.message)
    });
  }

  return res.status(500).json({
    message: 'Error interno del servidor',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = app;
