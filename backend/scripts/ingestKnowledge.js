const fs = require("node:fs/promises");
const path = require("node:path");
const backendRoot = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(backendRoot, ".env"), quiet: true });
const { getAiConfig } = require("../ai/config");
const { prepareIndex, indexDocument } = require("../ai/rag/indexDocument");
const { embedTexts, DIMENSIONS } = require("../ai/providers/embeddings");
const { sourcePath, lockFile, openIngestionCollection } = require("../ai/rag/storage");

async function main() {
  const args = process.argv.slice(2);
  let file = sourcePath;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--file" && args[i + 1]) file = args[++i];
    else throw new Error("Usage: npm run ai:ingest -- [--dry-run] [--file data/raw/file.md]");
  }
  const absoluteFile = path.resolve(backendRoot, file);
  if (path.extname(absoluteFile).toLowerCase() !== ".md") throw new Error("Only Markdown files are supported.");
  const prepare = async () => {
    const prepared = prepareIndex({ markdown: await fs.readFile(absoluteFile, "utf8"), sourceFile: path.basename(absoluteFile) });
    console.log(`Document: ${prepared.documentId} | version ${prepared.version}`);
    console.log(`Chunks: ${prepared.chunks.length} | model: ${prepared.model} | dimensions: ${DIMENSIONS}`);
    console.log(`Collection: ${getAiConfig().collection}`);
    return prepared;
  };
  if (dryRun) { await prepare(); console.log("DRY RUN OK: no API calls or database writes."); return; }

  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  let lock;
  try { lock = await fs.open(lockFile, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("Another ingest may be running. If a previous run was interrupted, confirm it has stopped before removing backend/data/.ai-ingest.lock.");
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    // Read after taking the lock so an admin replacement cannot race this read.
    const prepared = await prepare();
    console.log("Checking Chroma ...");
    const collection = await openIngestionCollection();
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
