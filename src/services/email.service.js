const nodemailer = require('nodemailer');

const required = (name) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Falta configurar ${name}`);
  return value;
};

const smtpSecure = () => {
  const value = String(process.env.SMTP_SECURE || 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(value)) throw new Error('SMTP_SECURE debe ser true o false');
  return value === 'true';
};

const createTransporter = () => {
  const port = Number(required('SMTP_PORT'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT no es valido');

  return nodemailer.createTransport({
    host: required('SMTP_HOST'),
    port,
    secure: smtpSecure(),
    auth: {
      user: required('SMTP_USER'),
      pass: required('SMTP_PASSWORD')
    }
  });
};

const buildResetLink = (token) => {
  const resetUrl = new URL(required('FRONTEND_RESET_URL'));
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
};

const sendPasswordResetEmail = async (to, token) => {
  const resetLink = buildResetLink(token);
  await createTransporter().sendMail({
    from: required('EMAIL_FROM'),
    to,
    subject: 'Restablece tu contrasena - Physio Active',
    text: `Recibimos una solicitud para restablecer tu contrasena. El enlace es valido durante 60 minutos:\n\n${resetLink}\n\nSi no realizaste esta solicitud, ignora este mensaje.`,
    html: `<p>Recibimos una solicitud para restablecer tu contrasena.</p><p><a href="${resetLink}">Restablecer contrasena</a></p><p>Este enlace es valido durante 60 minutos. Si no realizaste esta solicitud, ignora este mensaje.</p>`
  });
};

module.exports = { buildResetLink, sendPasswordResetEmail };
