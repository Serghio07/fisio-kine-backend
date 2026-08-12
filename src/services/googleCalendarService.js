const crypto = require('crypto');
const { google } = require('googleapis');
const { GoogleCalendarIntegracion } = require('../models');

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const DEFAULT_CALENDAR_ID = 'primary';
const GOOGLE_STATUS_TIMEOUT_MS = 10000;
const required = (name) => { const value = process.env[name]; if (!value) throw new Error(`Falta configurar ${name}`); return value; };
const oauthClient = () => new google.auth.OAuth2(required('GOOGLE_CLIENT_ID'), required('GOOGLE_CLIENT_SECRET'), required('GOOGLE_REDIRECT_URI'));
const encryptionKey = () => crypto.createHash('sha256').update(required('GOOGLE_TOKEN_ENCRYPTION_KEY')).digest();
const encrypt = (value) => {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
};
const decrypt = (value) => {
  if (!value) return null;
  const [iv, tag, encrypted] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};
const generateAuthUrl = (state) => oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [SCOPE], state });
const exchangeCodeForTokens = async (code) => (await oauthClient().getToken(code)).tokens;
const saveTokens = async (tokens) => {
  const existing = await GoogleCalendarIntegracion.findByPk(1);
  const refreshToken = tokens.refresh_token || (existing && decrypt(existing.refresh_token_cifrado));
  if (!refreshToken) throw new Error('Google no devolvio refresh token; vuelva a autorizar con consentimiento');
  await GoogleCalendarIntegracion.upsert({
    id: 1,
    access_token_cifrado: tokens.access_token ? encrypt(tokens.access_token) : existing?.access_token_cifrado || null,
    refresh_token_cifrado: encrypt(refreshToken),
    expiry_date: tokens.expiry_date || existing?.expiry_date || null,
    calendar_id: process.env.GOOGLE_CALENDAR_ID || DEFAULT_CALENDAR_ID
  });
};
const getAuthorizedClient = async () => {
  const stored = await GoogleCalendarIntegracion.findByPk(1);
  if (!stored?.refresh_token_cifrado) return null;
  const client = oauthClient();
  client.setCredentials({ access_token: decrypt(stored.access_token_cifrado), refresh_token: decrypt(stored.refresh_token_cifrado), expiry_date: stored.expiry_date == null ? undefined : Number(stored.expiry_date) });
  client.on('tokens', (tokens) => saveTokens(tokens).catch(() => console.error('[Google Calendar] Error guardando tokens renovados')));
  return { client, calendarId: stored.calendar_id || process.env.GOOGLE_CALENDAR_ID || DEFAULT_CALENDAR_ID };
};
const calendarCall = async (method, params) => {
  const authorization = await getAuthorizedClient();
  if (!authorization) throw Object.assign(new Error('Google Calendar no esta conectado'), { code: 'GOOGLE_CALENDAR_NOT_CONNECTED' });
  return google.calendar({ version: 'v3', auth: authorization.client }).events[method]({ calendarId: authorization.calendarId, ...params });
};

const getConnectionStatus = async () => {
  const stored = await GoogleCalendarIntegracion.findByPk(1);
  if (!stored?.refresh_token_cifrado) return { connected: false };
  try {
    const authorization = await getAuthorizedClient();
    await google.calendar({ version: 'v3', auth: authorization.client }).events.list({
      calendarId: authorization.calendarId,
      maxResults: 1,
      singleEvents: false,
      timeout: GOOGLE_STATUS_TIMEOUT_MS
    });
    return { connected: true, calendarId: authorization.calendarId, connectedAt: stored.created_at || null };
  } catch {
    console.error('[Google Calendar] No se pudo verificar la conexion almacenada');
    return { connected: false, reason: 'AUTHORIZATION_INVALID' };
  }
};

const disconnect = async () => {
  const stored = await GoogleCalendarIntegracion.findByPk(1);
  if (!stored) return { disconnected: true, revocation: 'NOT_REQUIRED' };
  let revocation = 'NOT_ATTEMPTED';
  try {
    const refreshToken = decrypt(stored.refresh_token_cifrado);
    if (refreshToken) {
      await oauthClient().revokeToken(refreshToken);
      revocation = 'REVOKED';
    }
  } catch {
    revocation = 'FAILED';
    console.error('[Google Calendar] Google no pudo confirmar la revocacion; se eliminaran las credenciales locales');
  }
  await stored.destroy();
  return { disconnected: true, revocation };
};

module.exports = {
  SCOPE, generateAuthUrl, exchangeCodeForTokens, saveTokens,
  isConnected: async () => (await getConnectionStatus()).connected,
  getConnectionStatus,
  disconnect,
  createEvent: (requestBody) => calendarCall('insert', { requestBody }),
  updateEvent: (eventId, requestBody) => calendarCall('patch', { eventId, requestBody }),
  deleteEvent: (eventId) => calendarCall('delete', { eventId })
};
