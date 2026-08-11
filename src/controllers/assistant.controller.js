const { buildOperationalScopes, getOperationalSummary } = require('../services/assistant/operationalSummary.service');
const { processAssistantChat } = require('../services/assistant/assistantChat.service');

const operationalSummary = async (req, res, next) => {
  try {
    return res.json(await getOperationalSummary(req.user));
  } catch (error) { return next(error); }
};

const chat = async (req, res, next) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) return res.status(400).json({ message: 'Escribe una consulta para el asistente.' });
    if (message.length > 3000) return res.status(413).json({ message: 'La consulta no puede superar 3000 caracteres.' });
    return res.json(await processAssistantChat({ message, context: req.body?.context, conversation: req.body?.conversation, user: req.user, usuario: req.usuario }));
  } catch (error) { return next(error); }
};

module.exports = { buildOperationalScopes, operationalSummary, chat };
