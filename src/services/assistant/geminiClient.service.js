const assistantSystemPrompt = require('../../config/assistant/assistantSystemPrompt');
const { GEMINI_FUNCTION_DECLARATIONS } = require('../../config/assistant/assistantTools');

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 12000;

function getGeminiConfig(env = process.env) {
  return {
    enabled: String(env.GEMINI_ENABLED || 'true').toLowerCase() === 'true' && Boolean(env.GEMINI_API_KEY),
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL || DEFAULT_MODEL,
    timeoutMs: Math.max(1000, Math.min(Number(env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 30000))
  };
}

async function createGeminiClient(config = getGeminiConfig()) {
  if (!config.enabled) return null;
  const { GoogleGenAI } = await import('@google/genai');
  return new GoogleGenAI({ apiKey: config.apiKey });
}

async function generateWithTimeout(client, params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.models.generateContent({ ...params, config: { ...params.config, abortSignal: controller.signal } });
  } finally {
    clearTimeout(timer);
  }
}

const baseConfig = () => ({
  systemInstruction: assistantSystemPrompt,
  maxOutputTokens: 600,
  tools: [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }]
});

async function requestGemini({ contents, client, config = getGeminiConfig() }) {
  const activeClient = client || await createGeminiClient(config);
  if (!activeClient) return { unavailable: true };
  const response = await generateWithTimeout(activeClient, { model: config.model, contents, config: baseConfig() }, config.timeoutMs);
  return {
    text: String(response.text || '').trim(),
    functionCalls: response.functionCalls || [],
    modelContent: response.candidates?.[0]?.content,
    usage: response.usageMetadata ? {
      promptTokens: response.usageMetadata.promptTokenCount,
      outputTokens: response.usageMetadata.candidatesTokenCount,
      totalTokens: response.usageMetadata.totalTokenCount
    } : undefined
  };
}

async function completeAfterTools({ contents, modelContent, toolResults, client, config = getGeminiConfig() }) {
  const activeClient = client || await createGeminiClient(config);
  if (!activeClient) return { unavailable: true };
  const toolParts = toolResults.map(({ name, data }) => ({ functionResponse: { name, response: { result: data } } }));
  const finalContents = [...contents, modelContent || { role: 'model', parts: [] }, { role: 'user', parts: toolParts }];
  const response = await generateWithTimeout(activeClient, { model: config.model, contents: finalContents, config: baseConfig() }, config.timeoutMs);
  return { text: String(response.text || '').trim(), usage: response.usageMetadata };
}

module.exports = { DEFAULT_MODEL, getGeminiConfig, createGeminiClient, requestGemini, completeAfterTools };
