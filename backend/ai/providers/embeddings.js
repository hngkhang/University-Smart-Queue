const { getAiConfig } = require("../config");

const DIMENSIONS = 3072;

// Keep document and query embeddings in the same model/vector space.
async function embedTexts(texts, taskType, { fetchImpl = fetch, signal } = {}) {
  const config = getAiConfig();
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = config.embeddingModel.replace(/^models\//, "");
  if (!key) throw new Error("Missing GEMINI_API_KEY in backend/.env.");
  if (model !== "gemini-embedding-001") {
    throw new Error("This ingestion command supports gemini-embedding-001. Use a separate collection when changing embedding models.");
  }
  if (!texts.length || texts.length > 20 || texts.some(text => typeof text !== "string" || !text.trim())) {
    throw new Error("Embedding requires 1-20 nonempty text passages.");
  }
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      signal: signal || AbortSignal.timeout(Math.max(config.timeoutMs, 60000)),
      body: JSON.stringify({ requests: texts.map(text => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: DIMENSIONS,
      })) }),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    const detail = String(body.error?.message || "Request failed").split(key).join("[REDACTED]");
    const error = new Error(`Gemini HTTP ${response.status}: ${detail}`);
    error.providerStatus = response.status;
    throw error;
  }
  const vectors = body.embeddings?.map(item => item.values);
  if (!Array.isArray(vectors) || vectors.length !== texts.length || vectors.some(vector =>
    !Array.isArray(vector) || vector.length !== DIMENSIONS || vector.some(value => !Number.isFinite(value)))) {
    throw new Error("Gemini returned invalid or incomplete embedding vectors; nothing will be published.");
  }
  return vectors;
}

module.exports = { DIMENSIONS, embedTexts };
