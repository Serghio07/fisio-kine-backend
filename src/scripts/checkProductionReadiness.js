const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const REQUIRED_TABLES = require('./verifyDatabase').required;

const SECRET_KEYS = ['DB_PASSWORD', 'JWT_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_APP_SECRET'];
const bool = (value) => value === 'true';

const inspectEnvironment = (env = process.env) => {
  const errors = [];
  const warnings = [];
  if (env.DB_SYNC !== 'false') errors.push('DB_SYNC debe ser false');
  if (env.NODE_ENV !== 'production') warnings.push('NODE_ENV no es production');
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'JWT_SECRET', 'CORS_ALLOWED_ORIGINS']) {
    if (!env[key]) errors.push(`Falta ${key}`);
  }
  if ((env.JWT_SECRET || '').length < 32) errors.push('JWT_SECRET debe tener al menos 32 caracteres');
  if (bool(env.WHATSAPP_REMINDERS_ENABLED)
      || bool(env.WHATSAPP_MANUAL_REPLIES_ENABLED)
      || bool(env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED)) {
    warnings.push('Hay jobs o envios sensibles habilitados');
  }
  if ((env.CORS_ALLOWED_ORIGINS || '').includes('*')) errors.push('CORS no puede contener *');
  return { errors, warnings, secrets: Object.fromEntries(SECRET_KEYS.map((key) => [key, Boolean(env[key])])) };
};

const listJavaScriptFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(target);
    return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
  });
};

const inspectSourceContents = (entries) => {
  const errors = [];
  const unsafeSync = /\.sync\s*\(\s*\{[\s\S]{0,300}?\b(?:alter|force)\s*:\s*true/i;
  const runtimeDdl = /\b(?:ALTER\s+TABLE|CREATE\s+(?:TABLE|INDEX|TYPE)|DROP\s+(?:TABLE|INDEX|TYPE|CONSTRAINT)|TRUNCATE\s+)/i;
  for (const entry of entries) {
    if (unsafeSync.test(entry.content)) errors.push(`sync inseguro en ${entry.path}`);
    if (entry.runtime && runtimeDdl.test(entry.content)) errors.push(`DDL runtime en ${entry.path}`);
  }
  return errors;
};

const inspectExecutableSource = (sourceRoot = path.resolve(__dirname, '..')) => {
  const runtimeRoots = new Set(['controllers', 'services', 'routes', 'middlewares']);
  const entries = listJavaScriptFiles(sourceRoot).map((filePath) => {
    const relative = path.relative(sourceRoot, filePath).replaceAll('\\', '/');
    return {
      path: `src/${relative}`,
      content: fs.readFileSync(filePath, 'utf8'),
      runtime: runtimeRoots.has(relative.split('/')[0])
    };
  });
  return { errors: inspectSourceContents(entries) };
};

const findTool = (name) => {
  const direct = spawnSync('where.exe', [name], { encoding: 'utf8' });
  if (direct.status === 0) return true;
  const root = 'C:\\Program Files\\PostgreSQL';
  if (!fs.existsSync(root)) return false;
  return fs.readdirSync(root).some((version) => fs.existsSync(path.join(root, version, 'bin', `${name}.exe`)));
};

const run = async ({ env = process.env, db = require('../config/database') } = {}) => {
  const report = inspectEnvironment(env);
  report.errors.push(...inspectExecutableSource().errors);
  try {
    await db.authenticate();
    const [rows] = await db.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public'", { raw: true });
    const names = new Set(rows.map((item) => item.name));
    const missing = REQUIRED_TABLES.filter((name) => !names.has(name));
    if (missing.length) report.errors.push(`Tablas faltantes: ${missing.join(', ')}`);
  } catch {
    report.errors.push('No se pudo conectar a PostgreSQL');
  }
  for (const tool of ['pg_dump', 'pg_restore']) {
    if (!findTool(tool)) report.errors.push(`No esta disponible ${tool}`);
  }
  const backupDir = path.resolve(__dirname, '../../backups');
  const writeTarget = fs.existsSync(backupDir) ? backupDir : path.dirname(backupDir);
  try {
    fs.accessSync(writeTarget, fs.constants.W_OK);
  } catch {
    report.errors.push('La carpeta backups no es escribible');
  }
  report.configuration = {
    node_env: env.NODE_ENV || 'AUSENTE',
    db_sync: env.DB_SYNC || 'AUSENTE',
    whatsapp_enabled: bool(env.WHATSAPP_ENABLED),
    reminders_enabled: bool(env.WHATSAPP_REMINDERS_ENABLED),
    manual_replies_enabled: bool(env.WHATSAPP_MANUAL_REPLIES_ENABLED),
    referral_alerts_enabled: bool(env.WHATSAPP_REFERRAL_PENDING_ALERT_ENABLED),
    templates_configured: Boolean(env.WHATSAPP_REMINDER_TEMPLATE_NAME && env.WHATSAPP_REMINDER_TEMPLATE_LANGUAGE)
  };
  report.status = report.errors.length ? 'NOT_READY' : report.warnings.length ? 'READY_WITH_WARNINGS' : 'READY';
  console.log(JSON.stringify(report, null, 2));
  return report;
};

if (require.main === module) {
  run().catch(() => {
    console.error('READINESS_ERROR');
    process.exitCode = 1;
  }).finally(() => require('../config/database').close());
}

module.exports = { inspectEnvironment, inspectExecutableSource, inspectSourceContents, run, SECRET_KEYS };
