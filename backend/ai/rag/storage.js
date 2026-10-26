const fs = require("node:fs/promises");
const path = require("node:path");
const { ChromaClient } = require("chromadb");
const { getAiConfig } = require("../config");
const { DIMENSIONS } = require("../providers/embeddings");

const dataDirectory = path.resolve(__dirname, "../../data");
const lockFile = path.join(dataDirectory, ".ai-ingest.lock");
const sourceFile = "KB-SmartQueue-Student-Service-Guide.vi.md";
const sourcePath = path.join(dataDirectory, "raw", sourceFile);

async function openIngestionCollection() {
  const config = getAiConfig();
  if (!config.hasApiKey) throw Object.assign(new Error("Missing GEMINI_API_KEY."), { code: "AI_KEY_MISSING" });
  const model = config.embeddingModel.replace(/^models\//, "");
  if (model !== "gemini-embedding-001") throw Object.assign(new Error("Unsupported embedding model."), { code: "AI_MODEL_UNSUPPORTED" });
  const makeClient = () => new ChromaClient({ ...config.chroma,
    fetchOptions: { signal: AbortSignal.timeout(30000) },
  });
  await makeClient().heartbeat();
  const created = await makeClient().getOrCreateCollection({
    name: config.collection, embeddingFunction: null,
    configuration: { hnsw: { space: "cosine" } },
    metadata: { embeddingModel: model, embeddingDimensions: DIMENSIONS },
  });
  const open = () => makeClient().getCollection({ name: config.collection, embeddingFunction: null });
  return {
    metadata: created.metadata,
    get: async options => (await open()).get(options),
    upsert: async options => (await open()).upsert(options),
    delete: async options => (await open()).delete(options),
  };
}

module.exports = { lockFile, sourceFile, sourcePath, openIngestionCollection };
