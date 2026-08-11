const crypto = require('crypto');
const googleCalendar = require('../services/googleCalendarService');

const stateSecret = () => process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const createState = (userId) => {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};
const validState = (state) => {
  try {
    const [payload, signature] = String(state || '').split('.');
    const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return received.length === expected.length && crypto.timingSafeEqual(received, expected) && data.expiresAt > Date.now();
  } catch { return false; }
};

const auth = (req, res, next) => {
  try { return res.redirect(googleCalendar.generateAuthUrl(createState(req.usuario.id))); }
  catch (error) { return next(error); }
};
const callback = async (req, res) => {
  if (req.query.error) return res.status(400).type('html').send('<h1>Autorizacion cancelada</h1><p>Google Calendar no fue conectado.</p>');
  if (!req.query.code || !validState(req.query.state)) return res.status(400).type('html').send('<h1>Solicitud invalida o expirada</h1><p>Inicie nuevamente la conexion desde Physio Active.</p>');
  try {
    const tokens = await googleCalendar.exchangeCodeForTokens(req.query.code);
    await googleCalendar.saveTokens(tokens);
    return res.type('html').send('<h1>Google Calendar conectado correctamente.</h1><p>Physio Active ya tiene autorizacion para administrar los eventos del calendario.</p>');
  } catch {
    console.error('[Google Calendar] Error completando autorizacion');
    return res.status(500).type('html').send('<h1>No se pudo conectar Google Calendar</h1><p>Intente nuevamente desde Physio Active.</p>');
  }
};
const status = async (req, res, next) => {
  try { return res.json({ connected: await googleCalendar.isConnected() }); }
  catch (error) { return next(error); }
};

module.exports = { auth, callback, status };
