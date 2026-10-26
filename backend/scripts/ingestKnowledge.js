const fs = require("node:fs/promises");
const path = require("node:path");
const backendRoot = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(backendRoot, ".env"), quiet: true });
const { getAiConfig } = require("../ai/config");
const { prepareIndex, indexDocument } = require("../ai/rag/indexDocument");
const { embedTexts, DIMENSIONS } = require("../ai/providers/embeddings");

async function main() {
  const args = process.argv.slice(2);
  let file = "data/raw/KB-SmartQueue-Student-Service-Guide.vi.md";
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--file" && args[i + 1]) file = args[++i];
    else throw new Error("Usage: npm run ai:ingest -- [--dry-run] [--file data/raw/file.md]");
  }
  const absoluteFile = path.resolve(backendRoot, file);
  if (path.extname(absoluteFile).toLowerCase() !== ".md") throw new Error("Only Markdown files are supported.");
  const prepared = prepareIndex({ markdown: await fs.readFile(absoluteFile, "utf8"), sourceFile: path.basename(absoluteFile) });
  const config = getAiConfig();
  console.log(`Document: ${prepared.documentId} | version ${prepared.version}`);
  console.log(`Chunks: ${prepared.chunks.length} | model: ${prepared.model} | dimensions: ${DIMENSIONS}`);
  console.log(`Collection: ${config.collection}`);
  if (dryRun) { console.log("DRY RUN OK: no API calls or database writes."); return; }
  if (!config.hasApiKey) throw new Error("Missing GEMINI_API_KEY in backend/.env.");
  if (prepared.model !== "gemini-embedding-001") throw new Error("Set AI_EMBEDDING_MODEL=gemini-embedding-001 for this ingestion command.");

  const dataDirectory = path.join(backendRoot, "data");
  await fs.mkdir(dataDirectory, { recursive: true });
  const lockFile = path.join(dataDirectory, ".ai-ingest.lock");
  let lock;
  try { lock = await fs.open(lockFile, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another ingest may be running. If a previous run was interrupted, confirm it has stopped before removing backend/data/.ai-ingest.lock.");
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    const { ChromaClient } = require("chromadb");
    const makeClient = () => new ChromaClient({ ...config.chroma,
      fetchOptions: { signal: AbortSignal.timeout(30000) },
    });
    console.log("Checking Chroma ...");
    await makeClient().heartbeat();
    const created = await makeClient().getOrCreateCollection({
      name: config.collection,
      embeddingFunction: null,
      configuration: { hnsw: { space: "cosine" } },
      metadata: { embeddingModel: prepared.model, embeddingDimensions: DIMENSIONS },
    });
    // Gemini may take minutes; each storage operation needs a fresh deadline.
    const openCollection = () => makeClient().getCollection({ name: config.collection, embeddingFunction: null });
    const collection = {
      metadata: created.metadata,
      get: async options => (await openCollection()).get(options),
      upsert: async options => (await openCollection()).upsert(options),
      delete: async options => (await openCollection()).delete(options),
    };
    const result = await indexDocument({ prepared, collection,
      embedDocuments: texts => embedTexts(texts, "RETRIEVAL_DOCUMENT"), log: console.log,
    });
    console.log(`${result.skipped ? "UNCHANGED" : "SUCCESS"}: ${result.count} chunks verified; ${result.removed} old chunks removed.`);
    console.log("Ingestion complete. Start the backend/frontend and refresh the assistant status to chat.");
  } finally {
    await lock.close();
    await fs.unlink(lockFile);
  }
}

main().catch(error => {
  const key = process.env.GEMINI_API_KEY?.trim();
  const message = String(error.message);
  console.error("INGEST FAILED:", key ? message.split(key).join("[REDACTED]") : message);
  process.exitCode = 1;
});
