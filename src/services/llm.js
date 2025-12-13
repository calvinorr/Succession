const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY not set. LLM calls will fail.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Send a chat request to Gemini
 * @param {string} systemPrompt - The system instruction for the model
 * @param {Array<{role: 'user'|'model', content: string}>} messages - Conversation history
 * @param {object} options - Optional settings
 * @param {string} options.model - Model to use (default: gemini-2.0-flash)
 * @returns {Promise<string>} The model's response text
 */
async function chat(systemPrompt, messages, options = {}) {
  if (!genAI) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const model = genAI.getGenerativeModel({
    model: options.model || DEFAULT_MODEL,
    systemInstruction: systemPrompt,
  });

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : msg.role,
    parts: [{ text: msg.content }],
  }));

  const chat = model.startChat({ history });

  // Get the last message to send
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('Last message must be from user');
  }

  const result = await chat.sendMessage(lastMessage.content);
  return result.response.text();
}

module.exports = { chat, DEFAULT_MODEL };
