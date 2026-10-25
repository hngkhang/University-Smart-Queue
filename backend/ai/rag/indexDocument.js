const { createHash } = require("node:crypto");
const { getAiConfig } = require("../config");
const { prepareMarkdownDocument } = require("./ingest");
const { DIMENSIONS } = require("../providers/embeddings");

function prepareIndex({ markdown, sourceFile }) {
  const documentId = markdown.match(/^- Mã tài liệu:\s*(.+?)\.?\s*$/m)?.[1];
  const version = markdown.match(/^- Phiên bản:\s*(.+?)\.?\s*$/m)?.[1];
  if (!documentId || !version) throw new Error("Markdown must contain '- Mã tài liệu: ...' and '- Phiên bản: ...'.");
  const config = getAiConfig();
  const model = config.embeddingModel.replace(/^models\//, "");
  const revision = createHash("sha256").update(JSON.stringify({
    markdown, sourceFile, model, dimensions: DIMENSIONS, taskType: "RETRIEVAL_DOCUMENT",
    chunkSize: config.chunkSize, overlap: config.chunkOverlap, pipelineVersion: 1,
  })).digest("hex");
  const chunks = prepareMarkdownDocument({ documentId, version, markdown }).map(chunk => ({
    ...chunk,
    id: `${chunk.id}:${revision}`,
    metadata: { ...chunk.metadata, revision, sourceFile, embeddingModel: model, visibility: "public" },
  }));
  if (!chunks.length || chunks.length > 1000) throw new Error("Expected between 1 and 1000 chunks for this local ingestion command.");
  return { documentId, version, revision, model, chunks };
}

// All Gemini calls finish before replacing data. A failed embed preserves the old document.
// CLI serializes runs with a local lock; do not run concurrent writers from other machines.
async function indexDocument({ prepared, collection, embedDocuments, log = () => {} }) {
  if (collection.metadata?.embeddingModel !== prepared.model || collection.metadata?.embeddingDimensions !== DIMENSIONS) {
    throw new Error("Collection embedding model/dimensions differ. Choose a new CHROMA_COLLECTION; existing data was not changed.");
  }
  const previous = await collection.get({ where: { documentId: prepared.documentId }, include: ["metadatas"] });
  const wanted = new Set(prepared.chunks.map(chunk => chunk.id));
  const present = new Set(previous.ids);
  const complete = prepared.chunks.every(chunk => present.has(chunk.id));
  const staleIds = previous.ids.filter(id => !wanted.has(id));

  if (!complete) {
    const vectors = [];
    for (let start = 0; start < prepared.chunks.length; start += 20) {
      const batch = prepared.chunks.slice(start, start + 20);
      log(`Embedding ${start + 1}-${start + batch.length}/${prepared.chunks.length} ...`);
      const embedded = await embedDocuments(batch.map(chunk => chunk.text));
      if (embedded.length !== batch.length || embedded.some(vector => !Array.isArray(vector) ||
        vector.length !== DIMENSIONS || vector.some(value => !Number.isFinite(value)))) {
        throw new Error("Invalid embeddings; old document was kept.");
      }
      vectors.push(...embedded);
    }
    log(`Saving ${prepared.chunks.length} chunks to Chroma ...`);
    await collection.upsert({
      ids: prepared.chunks.map(chunk => chunk.id),
      documents: prepared.chunks.map(chunk => chunk.text),
      metadatas: prepared.chunks.map(chunk => chunk.metadata),
      embeddings: vectors,
    });
  }

  // Verify new IDs before removing only this document's obsolete chunks.
  const saved = await collection.get({ ids: [...wanted], include: ["metadatas"] });
  const savedIds = new Set(saved.ids);
  if ([...wanted].some(id => !savedIds.has(id))) throw new Error("Chroma verification failed; old chunks were retained. Rerun ingestion.");
  if (staleIds.length) await collection.delete({ ids: staleIds });
  const final = await collection.get({ where: { documentId: prepared.documentId }, include: ["metadatas"] });
  if (final.ids.length !== wanted.size || final.ids.some(id => !wanted.has(id))) {
    throw new Error("Unexpected document count after saving. Check for concurrent writers and rerun ingestion.");
  }
  return { skipped: complete, count: final.ids.length, removed: staleIds.length };
}

module.exports = { prepareIndex, indexDocument };
