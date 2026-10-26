const { test } = require("node:test");
const assert = require("node:assert/strict");
const { prepareIndex, indexDocument } = require("../ai/rag/indexDocument");
const { embedTexts, DIMENSIONS } = require("../ai/providers/embeddings");

const markdown = "# Guide\n\n- Mã tài liệu: GUIDE.\n- Phiên bản: 1.0.\n\n## Booking\nBook an appointment.";
function prepare(text = markdown) { return prepareIndex({ markdown: text, sourceFile: "guide.md" }); }
const embeddings = async texts => texts.map(() => Array(DIMENSIONS).fill(0.1));

function fakeCollection() {
  const records = new Map();
  return {
    records,
    metadata: { embeddingModel: "gemini-embedding-001", embeddingDimensions: DIMENSIONS },
    async get({ ids, where }) {
      const entries = [...records].filter(([id, row]) => ids ? ids.includes(id) : row.metadata.documentId === where.documentId);
      return { ids: entries.map(([id]) => id), metadatas: entries.map(([, row]) => row.metadata) };
    },
    async upsert({ ids, metadatas, documents }) {
      ids.forEach((id, i) => records.set(id, { metadata: metadatas[i], document: documents[i] }));
    },
    async delete({ ids }) { ids.forEach(id => records.delete(id)); },
  };
}

test("document metadata preserves dotted versions; unchanged index does not call Gemini", async () => {
  const prepared = prepare();
  assert.equal(prepared.documentId, "GUIDE");
  assert.equal(prepared.version, "1.0");
  const collection = fakeCollection();
  await indexDocument({ prepared, collection, embedDocuments: embeddings });
  const result = await indexDocument({ prepared, collection, embedDocuments: () => { throw Error("Must skip"); } });
  assert.equal(result.skipped, true);
  assert.equal(result.count, prepared.chunks.length);
});

test("changed content replaces old chunks while retaining other documents", async () => {
  const collection = fakeCollection();
  const first = prepare();
  await indexDocument({ prepared: first, collection, embedDocuments: embeddings });
  collection.records.set("unrelated", { metadata: { documentId: "OTHER" } });
  const next = prepare(markdown.replace("1.0.", "1.1.") + "\nNew rule.");
  const result = await indexDocument({ prepared: next, collection, embedDocuments: embeddings });
  assert.equal(result.removed, first.chunks.length);
  assert(collection.records.has("unrelated"));
  assert(first.chunks.every(chunk => !collection.records.has(chunk.id)));
});

test("embedding failure never deletes or overwrites the previous revision", async () => {
  const collection = fakeCollection();
  await indexDocument({ prepared: prepare(), collection, embedDocuments: embeddings });
  const before = [...collection.records.entries()];
  await assert.rejects(indexDocument({ prepared: prepare(markdown + "Changed"), collection,
    embedDocuments: async () => { throw Error("HTTP 429"); },
  }), /429/);
  assert.deepEqual([...collection.records.entries()], before);
});

test("rerun recovers stale chunks after interrupted cleanup without embedding again", async () => {
  const collection = fakeCollection();
  const first = prepare();
  await indexDocument({ prepared: first, collection, embedDocuments: embeddings });
  const remove = collection.delete;
  collection.delete = async () => { throw Error("Interrupted"); };
  const next = prepare(markdown + "Changed");
  await assert.rejects(indexDocument({ prepared: next, collection, embedDocuments: embeddings }), /Interrupted/);
  collection.delete = remove;
  const result = await indexDocument({ prepared: next, collection, embedDocuments: () => { throw Error("Must skip"); } });
  assert.equal(result.skipped, true);
  assert.equal(collection.records.size, next.chunks.length);
});

test("incompatible collection is rejected before embedding", async () => {
  const collection = fakeCollection();
  collection.metadata.embeddingModel = "different-model";
  await assert.rejects(indexDocument({ prepared: prepare(), collection, embedDocuments: embeddings }), /differ/);
  assert.equal(collection.records.size, 0);
});

test("provider uses retrieval task, validates vector count, and redacts API errors", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-secret-value";
  try {
    await embedTexts(["hello"], "RETRIEVAL_DOCUMENT", { fetchImpl: async (url, options) => {
      assert(url.endsWith(":batchEmbedContents"));
      const body = JSON.parse(options.body);
      assert.equal(body.requests[0].taskType, "RETRIEVAL_DOCUMENT");
      assert.equal(body.requests[0].outputDimensionality, DIMENSIONS);
      return { ok: true, json: async () => ({ embeddings: [{ values: Array(DIMENSIONS).fill(0.1) }] }) };
    } });
    await assert.rejects(embedTexts(["hello"], "RETRIEVAL_DOCUMENT", { fetchImpl: async () => ({
      ok: true, json: async () => ({ embeddings: [] }),
    }) }), /incomplete/);
    await assert.rejects(embedTexts(["hello"], "RETRIEVAL_DOCUMENT", { fetchImpl: async () => ({
      ok: false, status: 403, json: async () => ({ error: { message: "Bad test-secret-value" } }),
    }) }), error => error.message.includes("[REDACTED]") && !error.message.includes("test-secret-value"));
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});
