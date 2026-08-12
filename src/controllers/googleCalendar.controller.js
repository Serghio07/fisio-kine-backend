const crypto = require('crypto');
const googleCalendar = require('../services/googleCalendarService');
const { Usuario } = require('../models');

const stateSecret = () => process.env.JWT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
const createState = (userId) => {
  const payload = Buffer.from(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', stateSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};
const readState = (state) => {
  try {
    const [payload, signature] = String(state || '').split('.');
    const expected = crypto.createHmac('sha256', stateSecret()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected) || data.expiresAt <= Date.now()) return null;
    return data;
  } catch { return null; }
};
const frontendIntegrationUrl = (result) => {
  const frontend = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
  frontend.pathname = '/integraciones';
  frontend.search = '';
  frontend.searchParams.set('google', result);
  return frontend.toString();
};

const auth = (req, res, next) => {
  try { return res.json({ authUrl: googleCalendar.generateAuthUrl(createState(req.usuario.id)) }); }
  catch (error) { return next(error); }
};
const callback = async (req, res) => {
  if (req.query.error) return res.redirect(frontendIntegrationUrl('cancelled'));
  const state = readState(req.query.state);
  if (!req.query.code || !state) return res.status(400).type('html').send('<h1>Solicitud invalida o expirada</h1><p>Inicie nuevamente la conexion desde Physio Active.</p>');
  try {
    const admin = await Usuario.findByPk(state.userId);
    if (!admin || admin.rol !== 'admin' || admin.estado !== 'activo' || admin.activo === false) {
      return res.status(403).type('html').send('<h1>Autorizacion rechazada</h1><p>La cuenta administradora ya no esta habilitada.</p>');
    }
    const tokens = await googleCalendar.exchangeCodeForTokens(req.query.code);
    await googleCalendar.saveTokens(tokens);
    return res.redirect(frontendIntegrationUrl('connected'));
  } catch {
    console.error('[Google Calendar] Error completando autorizacion');
    return res.redirect(frontendIntegrationUrl('error'));
  }
};
const status = async (req, res, next) => {
  try { return res.json(await googleCalendar.getConnectionStatus()); }
  catch (error) { return next(error); }
};
const disconnect = async (req, res, next) => {
  try { return res.json(await googleCalendar.disconnect()); }
  catch (error) { return next(error); }
};

module.exports = { auth, callback, createState, disconnect, frontendIntegrationUrl, readState, status };
