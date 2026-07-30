const { validateSimulatorSafety } = require('../config/whatsapp');

const requireWhatsappSimulator = (req, res, next) => {
  const validation = validateSimulatorSafety();
  if (!validation.ready) {
    return res.status(503).json({
      message: 'El simulador solo puede ejecutarse con physio_whatsapp_test y el proveedor SIMULATOR.',
      errors: validation.errors
    });
  }
  return next();
};

module.exports = requireWhatsappSimulator;
