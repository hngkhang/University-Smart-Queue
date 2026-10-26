const { getAiConfig } = require("./config");
const { AiError } = require("./errors");
const { retrieve } = require("./rag/retrieve");
const { generateAnswer, generateAnswerStream } = require("./rag/generate");
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

function beginQuestion(body, user) {
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
  return { message: message.trim(), user, state, now, metrics };
}

function finishQuestion(state, now, metrics) {
  state.busy = false;
  // Do not log questions, user identities, retrieved text or credentials.
  console.info(JSON.stringify({ ...metrics, latencyMs: Date.now() - now }));
}

async function answerQuestion(body, user) {
  const { message, state, now, metrics } = beginQuestion(body, user);
  try {
    const status = await getStatus();
    if (!status.canChat) throw new AiError("AI_SETUP_REQUIRED", status.message);
    const hits = await retrieve(message, user);
    const result = await generateAnswer(message, hits);
    Object.assign(metrics, { outcome: result.sources.length ? "answered" : "insufficient_evidence", sourceCount: result.sources.length,
      inputTokens: result.usage?.promptTokenCount ?? null, outputTokens: result.usage?.candidatesTokenCount ?? null,
      totalTokens: result.usage?.totalTokenCount ?? null });
    return { answer: result.answer, sources: result.sources };
  } catch (error) {
    Object.assign(metrics, { outcome: "error", code: error instanceof AiError ? error.code : "AI_INTERNAL_ERROR" });
    if (error instanceof AiError) throw error;
    throw new AiError("AI_UNAVAILABLE", "Trợ lý tạm thời gặp lỗi. Vui lòng thử lại sau.");
  } finally {
    finishQuestion(state, now, metrics);
  }
}

async function* streamQuestion(body, user, { signal } = {}) {
  const { message, state, now, metrics } = beginQuestion(body, user);
  try {
    const status = await getStatus();
    if (!status.canChat) throw new AiError("AI_SETUP_REQUIRED", status.message);
    if (signal?.aborted) return;
    const hits = await retrieve(message, user);
    if (signal?.aborted) return;
    for await (const event of generateAnswerStream(message, hits, { signal })) {
      if (signal?.aborted) return;
      if (event.type === "partial") yield { type: "partial", answer: event.answer };
      if (event.type === "done") {
        Object.assign(metrics, { outcome: event.sources.length ? "answered" : "insufficient_evidence", sourceCount: event.sources.length,
          inputTokens: event.usage?.promptTokenCount ?? null, outputTokens: event.usage?.candidatesTokenCount ?? null,
          totalTokens: event.usage?.totalTokenCount ?? null });
        yield { type: "done", answer: event.answer, sources: event.sources };
      }
    }
  } catch (error) {
    Object.assign(metrics, { outcome: signal?.aborted ? "cancelled" : "error", code: error instanceof AiError ? error.code : "AI_INTERNAL_ERROR" });
    if (signal?.aborted) return;
    if (error instanceof AiError) throw error;
    throw new AiError("AI_UNAVAILABLE", "Trợ lý tạm thời gặp lỗi. Vui lòng thử lại sau.");
  } finally {
    if (signal?.aborted && !metrics.outcome) metrics.outcome = "cancelled";
    finishQuestion(state, now, metrics);
  }
}

module.exports = { getStatus, answerQuestion, streamQuestion };
