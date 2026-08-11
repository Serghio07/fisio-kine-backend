const validOrigin = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && url.origin === url.href.replace(/\/$/, '');
  } catch { return false; }
};

const getAllowedOrigins = (env = process.env) => {
  // Los orígenes LAN específicos se configuran en CORS_ALLOWED_ORIGINS.
  const configured = String(env.CORS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(validOrigin);
  if (env.NODE_ENV !== 'production') configured.push('http://localhost:5173', 'http://localhost:3001');
  return [...new Set(configured)];
};

module.exports = { validOrigin, getAllowedOrigins };
