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
const googleCalendarRoutes = require('./routes/googleCalendar.routes');
const assistantRoutes = require('./routes/assistant.routes');
const registrarActividad = require('./middlewares/actividad.middleware');
const blogRoutes = require('./routes/blog.routes');
const blogCategoryRoutes = require('./routes/blogCategory.routes');
const publicBlogRoutes = require('./routes/publicBlog.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const whatsappReceptionReferralRoutes = require('./routes/whatsappReceptionReferral.routes');
const internalNotificationRoutes = require('./routes/internalNotification.routes');
const whatsappMonitoringRoutes=require('./routes/whatsappMonitoring.routes');
const { captureWhatsappRawBody } = require('./config/whatsapp');
const path = require('path');
const sequelize = require('./config/database');
const whatsappConfig = require('./config/whatsapp');
const { getAllowedOrigins } = require('./config/cors');

const app = express();

// La lista se carga al iniciar; reiniciar el backend después de cambiar CORS_ALLOWED_ORIGINS.
const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);

    console.warn(`[CORS] Solicitud bloqueada desde: ${String(origin).slice(0, 200)}`);
    const error = new Error('Origen no permitido por CORS');
    error.status = 403;
    return callback(error);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
};

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb', verify: captureWhatsappRawBody }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api/whatsapp', whatsappRoutes);
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(registrarActividad);
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads'), { maxAge: '1d', fallthrough: false }));

app.get('/api/health', async (req, res) => {
  let database = 'unavailable';
  try { await sequelize.authenticate(); database = 'available'; } catch {}
  const whatsapp = whatsappConfig.getWhatsappConfig();
  const payload = { status: database === 'available' ? 'ok' : 'degraded', service: 'Physio Active API', version: require('../package.json').version, environment: process.env.NODE_ENV || 'development', database, db_sync: false, whatsapp_enabled: whatsapp.enabled, jobs: { appointment_reminders: whatsappConfig.getWhatsappRemindersEnabled(), referral_alerts: whatsappConfig.getWhatsappReferralPendingAlertEnabled() } };
  res.status(database === 'available' ? 200 : 503).json(payload);
});

app.use('/api/auth', authRoutes);
app.use('/api/whatsapp/derivaciones', whatsappReceptionReferralRoutes);
app.use('/api/notificaciones', internalNotificationRoutes);
app.use('/api/whatsapp/monitoring',whatsappMonitoringRoutes);
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
app.use('/api/google-calendar', googleCalendarRoutes);
app.use('/api/asistente', assistantRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/blog-categories', blogCategoryRoutes);
app.use('/api/public/blog', publicBlogRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON invalido' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Cuerpo de solicitud demasiado grande' });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'La imagen no puede superar 5 MB.' });
  if (error.status) return res.status(error.status).json({ message: error.message, errors: error.errors });
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
