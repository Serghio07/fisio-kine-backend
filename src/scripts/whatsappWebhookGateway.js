const http = require('http');

const PORT = Number(process.env.WHATSAPP_GATEWAY_PORT || 3100);
const target = new URL(process.env.WHATSAPP_BACKEND_URL || 'http://127.0.0.1:3002');
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (!allowedHosts.has(target.hostname)) {
  throw new Error('WHATSAPP_BACKEND_URL debe apuntar a un backend local');
}

const createGateway = () => http.createServer((req, res) => {
  let requested;
  try {
    requested = new URL(req.url, 'http://gateway.local');
  } catch {
    res.writeHead(400).end('Solicitud invalida');
    return;
  }

  if (
    requested.pathname !== '/api/whatsapp/webhook'
    || !['GET', 'POST'].includes(req.method)
  ) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Ruta no encontrada' }));
    return;
  }

  const forwardedHeaders = {
    'content-type': req.headers['content-type'] || 'application/json'
  };
  if (req.headers['content-length']) forwardedHeaders['content-length'] = req.headers['content-length'];
  if (req.headers['x-hub-signature-256']) {
    forwardedHeaders['x-hub-signature-256'] = req.headers['x-hub-signature-256'];
  }

  const proxy = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    method: req.method,
    path: `${requested.pathname}${requested.search}`,
    headers: forwardedHeaders,
    timeout: 10000
  }, (proxyResponse) => {
    res.writeHead(proxyResponse.statusCode || 502, {
      'content-type': proxyResponse.headers['content-type'] || 'application/json'
    });
    proxyResponse.pipe(res);
    console.log('Gateway WhatsApp:', req.method, proxyResponse.statusCode || 502);
  });

  proxy.on('timeout', () => proxy.destroy(new Error('Tiempo de espera agotado')));
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Backend de WhatsApp no disponible' }));
  });
  req.pipe(proxy);
});

if (require.main === module) {
  createGateway().listen(PORT, '127.0.0.1', () => {
    console.log(`Gateway exclusivo de WhatsApp disponible en http://127.0.0.1:${PORT}`);
  });
}

module.exports = { createGateway };
