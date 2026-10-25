// Read at request time: server.js loads dotenv after importing routes.
function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function getAiConfig() {
  const chunkSize = positiveInteger(process.env.RAG_CHUNK_SIZE_CHARS, 1200);
  const overlap = Number(process.env.RAG_CHUNK_OVERLAP_CHARS ?? 200);
  return {
    hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    chatModel: process.env.AI_CHAT_MODEL || "gemini-3.5-flash-lite",
    embeddingModel: process.env.AI_EMBEDDING_MODEL || "gemini-embedding-001",
    timeoutMs: positiveInteger(process.env.AI_TIMEOUT_MS, 25000),
    chunkSize,
    chunkOverlap: Number.isSafeInteger(overlap) && overlap >= 0 && overlap < chunkSize
      ? overlap : Math.min(200, chunkSize - 1),
    topK: Math.min(positiveInteger(process.env.RAG_TOP_K, 5), 20),
    // Cosine distance, not confidence. Tune against evaluation questions.
    maxDistance: Number.isFinite(Number(process.env.RAG_MAX_DISTANCE)) && Number(process.env.RAG_MAX_DISTANCE) > 0
      ? Math.min(Number(process.env.RAG_MAX_DISTANCE), 2) : 0.6,
    maxQuestionLength: 2000,
    collection: process.env.CHROMA_COLLECTION || "smartqueue_knowledge",
    chroma: {
      host: process.env.CHROMA_HOST || "127.0.0.1",
      port: positiveInteger(process.env.CHROMA_PORT, 8000),
      ssl: process.env.CHROMA_SSL === "true",
    },
  };
}

module.exports = { getAiConfig };
