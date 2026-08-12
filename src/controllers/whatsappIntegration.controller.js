const integration = require('../services/whatsappIntegration.service');

const status = (req, res) => res.json(integration.getStatus());

const verifyConnection = async (req, res, next) => {
  try { return res.json(await integration.verifyConnection(req.user.id)); }
  catch (error) { return next(error); }
};

const sendTest = async (req, res, next) => {
  try {
    const result = await integration.sendTest(req.body.to);
    if (!result.success) {
      const statusCode = result.status === 400 || result.code === 'INVALID_RECIPIENT'
        ? 400
        : result.code === 'CONFIGURATION_ERROR' ? 503 : 502;
      return res.status(statusCode).json({ success: false, code: result.code, message: result.message });
    }
    return res.json({ success: true, message: 'Mensaje de prueba aceptado por WhatsApp.' });
  } catch (error) { return next(error); }
};

module.exports = { sendTest, status, verifyConnection };
