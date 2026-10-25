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

module.exports = { embedDocuments: texts => embedTexts(texts, "RETRIEVAL_DOCUMENT"), embedQuery, generateText, generateStructured, providerError };
