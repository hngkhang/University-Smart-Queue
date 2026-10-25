const { getAiConfig } = require("./config");
const { AiError } = require("./errors");
const { retrieve } = require("./rag/retrieve");
const { generateAnswer } = require("./rag/generate");
const { checkKnowledge } = require("./vectorStore");
const { version: promptVersion } = require("./prompts/ragAnswer");
const { randomUUID } = require("node:crypto");
const users = new Map();

async function getStatus() {
  try {
    if (!getAiConfig().hasApiKey) throw new AiError("AI_NOT_CONFIGURED", "Trợ lý chưa được cấu hình kết nối AI.");
    await checkKnowledge();
    // Does not spend Gemini quota on every widget open. Provider errors are reported on chat.
    return { state: "ready", canChat: true, message: "Bạn có thể hỏi về dịch vụ, đặt lịch và hàng đợi. Câu trả lời dựa trên tài liệu hướng dẫn." };
  } catch (error) {
    return { state: "setup_required", canChat: false,
      message: error instanceof AiError ? error.message : "Trợ lý tạm thời chưa sẵn sàng. Vui lòng thử lại sau." };
  }
}

async function answerQuestion(body, user) {
  const message = body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > getAiConfig().maxQuestionLength) {
    throw new AiError("AI_INVALID_INPUT", "Vui lòng nhập câu hỏi từ 1 đến 2.000 ký tự.", 400);
  }
  if (!user?._id || user.isActive === false) throw new AiError("AI_AUTH_REQUIRED", "Vui lòng đăng nhập để hỏi trợ lý.", 401);
  const id = String(user._id);
  const now = Date.now();
  for (const [key, value] of users) if (!value.busy && now - value.startedAt > 60000) users.delete(key);
  const state = users.get(id) || { startedAt: now, count: 0, busy: false };
  if (state.busy || state.count >= 10) throw new AiError("AI_RATE_LIMIT", "Bạn đang gửi câu hỏi quá nhanh. Hãy chờ câu trả lời hoặc thử lại sau một phút.", 429);
  state.busy = true;
  state.count++;
  users.set(id, state);
  const requestId = randomUUID();
  const metrics = { event: "ai_chat", requestId, model: getAiConfig().chatModel, promptVersion };
  try {
    const status = await getStatus();
    if (!status.canChat) throw new AiError("AI_SETUP_REQUIRED", status.message);
    const hits = await retrieve(message.trim(), user);
    const result = await generateAnswer(message.trim(), hits);
    Object.assign(metrics, { outcome: result.sources.length ? "answered" : "insufficient_evidence", sourceCount: result.sources.length,
      inputTokens: result.usage?.promptTokenCount ?? null, outputTokens: result.usage?.candidatesTokenCount ?? null,
      totalTokens: result.usage?.totalTokenCount ?? null });
    return { answer: result.answer, sources: result.sources };
  } catch (error) {
    Object.assign(metrics, { outcome: "error", code: error instanceof AiError ? error.code : "AI_INTERNAL_ERROR" });
    if (error instanceof AiError) throw error;
    throw new AiError("AI_UNAVAILABLE", "Trợ lý tạm thời gặp lỗi. Vui lòng thử lại sau.");
  } finally {
    state.busy = false;
    // Do not log questions, user identities, retrieved text or credentials.
    console.info(JSON.stringify({ ...metrics, latencyMs: Date.now() - now }));
  }
}

module.exports = { getStatus, answerQuestion };
