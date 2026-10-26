const { AiError } = require("../errors");
const { getAiConfig } = require("../config");

const { embedTexts } = require("./embeddings");

function providerError(error) {
  if (error instanceof AiError) return error;
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return new AiError("AI_TIMEOUT", "Dịch vụ AI phản hồi quá lâu. Vui lòng thử lại sau ít phút.", 504);
  }
  if (error.providerStatus === 429) return new AiError("AI_QUOTA", "Dịch vụ AI đang đạt giới hạn yêu cầu. Vui lòng thử lại sau ít phút.", 429);
  if ([400, 401, 403, 404].includes(error.providerStatus)) {
    return new AiError("AI_PROVIDER_CONFIG", "Chưa thể gọi model AI với cấu hình hiện tại. Vui lòng liên hệ người quản trị.");
  }
  return new AiError("AI_PROVIDER_UNAVAILABLE", "Chưa thể kết nối dịch vụ AI. Vui lòng thử lại sau.");
}

async function embedQuery(question, options = {}) {
  try {
    const signal = options.signal || AbortSignal.timeout(getAiConfig().timeoutMs);
    return (await embedTexts([question], "RETRIEVAL_QUERY", { ...options, signal }))[0];
  } catch (error) { throw providerError(error); }
}

async function generateStructured({ system, input, schema, jsonSchema = false }, { fetchImpl = fetch, signal } = {}) {
  const config = getAiConfig();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiError("AI_NOT_CONFIGURED", "Trợ lý chưa được cấu hình kết nối AI.");
  const model = config.chatModel.replace(/^models\//, "");
  try {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: signal || AbortSignal.timeout(config.timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          ...(model === "gemini-3.5-flash-lite" ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
          responseMimeType: "application/json",
          [jsonSchema ? "responseJsonSchema" : "responseSchema"]: schema,
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      const error = new Error("Gemini generation failed");
      error.providerStatus = response.status;
      throw error;
    }
    const candidate = body.candidates?.[0];
    if (candidate?.finishReason !== "STOP") {
      throw new AiError("AI_INCOMPLETE_ANSWER", "Chưa nhận được câu trả lời đầy đủ. Bạn hãy thử câu hỏi ngắn và cụ thể hơn.", 502);
    }
    const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("");
    let result;
    try { result = JSON.parse(text); } catch { throw new AiError("AI_INVALID_ANSWER", "Trợ lý chưa tạo được câu trả lời hợp lệ. Vui lòng thử lại.", 502); }
    return { data: result, usage: body.usageMetadata || {} };
  } catch (error) { throw providerError(error); }
}

async function generateText({ system, question, context }, options) {
  const { data: result, usage } = await generateStructured({ system,
    input: { question, referencePassages: context },
    schema: {
      type: "OBJECT", properties: { supported: { type: "BOOLEAN" }, answer: { type: "STRING" },
        sourceIds: { type: "ARRAY", items: { type: "STRING", enum: context.map(passage => passage.sourceId) } },
      }, required: ["supported", "answer", "sourceIds"],
    },
  }, options);
  if (!result || typeof result.supported !== "boolean" || typeof result.answer !== "string" || result.answer.length > 12000 || !Array.isArray(result.sourceIds)) {
    throw new AiError("AI_INVALID_ANSWER", "Trợ lý chưa tạo được câu trả lời hợp lệ. Vui lòng thử lại.", 502);
  }
  return { ...result, usage };
}

// Gemini streams SSE frames containing successive fragments of a structured JSON answer.
async function* streamFrames(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop();
      if (pending.length > 128000) throw new AiError("AI_INVALID_ANSWER", "Luồng trả lời vượt giới hạn cho phép.", 502);
      for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (data && data !== "[DONE]") yield JSON.parse(data);
      }
      if (done) {
        if (pending.trim()) {
          const data = pending.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          if (data && data !== "[DONE]") yield JSON.parse(data);
        }
        return;
      }
    }
  } finally { reader.releaseLock(); }
}

function partialAnswer(raw) {
  // Show only the answer string, never the surrounding JSON or unverified source IDs.
  const match = /"answer"\s*:\s*"/.exec(raw);
  if (!match || !/"supported"\s*:\s*true/.test(raw.slice(0, match.index))) return "";
  const start = match.index + match[0].length;
  let end = start;
  while (end < raw.length) {
    if (raw[end] === '"') break;
    if (raw[end] === "\\") {
      if (end + 1 >= raw.length) break;
      if (raw[end + 1] === "u" && end + 6 > raw.length) break;
      end += raw[end + 1] === "u" ? 6 : 2;
    } else end++;
  }
  try { return JSON.parse(`"${raw.slice(start, end)}"`); }
  catch { return ""; }
}

async function* generateTextStream({ system, question, context }, { fetchImpl = fetch, signal } = {}) {
  const config = getAiConfig();
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new AiError("AI_NOT_CONFIGURED", "Trợ lý chưa được cấu hình kết nối AI.");
  const model = config.chatModel.replace(/^models\//, "");
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let raw = "";
  let usage = {};
  let finishReason;
  try {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: combinedSignal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify({ question, referencePassages: context }) }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          ...(model === "gemini-3.5-flash-lite" ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT", propertyOrdering: ["supported", "answer", "sourceIds"],
            properties: { supported: { type: "BOOLEAN" }, answer: { type: "STRING" },
              sourceIds: { type: "ARRAY", items: { type: "STRING", enum: context.map(passage => passage.sourceId) } },
            }, required: ["supported", "answer", "sourceIds"],
          },
        },
      }),
    });
    if (!response.ok) {
      const error = new Error("Gemini generation failed");
      error.providerStatus = response.status;
      throw error;
    }
    if (!response.body) throw new AiError("AI_INCOMPLETE_ANSWER", "Chưa nhận được câu trả lời đầy đủ. Vui lòng thử lại.", 502);
    let previous = "";
    for await (const frame of streamFrames(response.body)) {
      const candidate = frame.candidates?.[0];
      const fragment = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || "").join("") || "";
      raw += fragment;
      if (raw.length > 24000) throw new AiError("AI_INVALID_ANSWER", "Câu trả lời vượt giới hạn cho phép.", 502);
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (frame.usageMetadata) usage = frame.usageMetadata;
      const preview = partialAnswer(raw);
      if (preview && preview !== previous && preview.length <= 12000) {
        previous = preview;
        yield { type: "partial", answer: preview };
      }
    }
    if (finishReason !== "STOP") throw new AiError("AI_INCOMPLETE_ANSWER", "Chưa nhận được câu trả lời đầy đủ. Bạn hãy thử câu hỏi ngắn và cụ thể hơn.", 502);
    let result;
    try { result = JSON.parse(raw); }
    catch { throw new AiError("AI_INVALID_ANSWER", "Trợ lý chưa tạo được câu trả lời hợp lệ. Vui lòng thử lại.", 502); }
    if (!result || typeof result.supported !== "boolean" || typeof result.answer !== "string" || result.answer.length > 12000 || !Array.isArray(result.sourceIds)) {
      throw new AiError("AI_INVALID_ANSWER", "Trợ lý chưa tạo được câu trả lời hợp lệ. Vui lòng thử lại.", 502);
    }
    yield { type: "done", result: { ...result, usage } };
  } catch (error) { throw providerError(error); }
}

module.exports = { embedDocuments: texts => embedTexts(texts, "RETRIEVAL_DOCUMENT"), embedQuery, generateText, generateTextStream, generateStructured, partialAnswer, providerError };
