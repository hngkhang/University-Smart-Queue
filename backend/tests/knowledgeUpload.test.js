const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { MAX_BYTES, validateUpload, createKnowledgeUpload } = require("../ai/knowledgeUpload");
const { prepareIndex, indexDocument } = require("../ai/rag/indexDocument");
const { sourceFile } = require("../ai/rag/storage");
const { DIMENSIONS } = require("../ai/providers/embeddings");

const original = "# Guide\n- Mã tài liệu: SQ-KB-STUDENT-GUIDE.\n- Phiên bản: 1.0.\n\n## Procedure\nOld procedure.";
const updated = original.replace("1.0", "1.1").replace("Old procedure", "New procedure");
const embed = async texts => texts.map(() => Array(DIMENSIONS).fill(0.1));
function fakeCollection() {
  const records = new Map();
  return {
    records, metadata: { embeddingModel: "gemini-embedding-001", embeddingDimensions: DIMENSIONS },
    async get({ ids, where, limit = Infinity }) {
      const entries = [...records].filter(([id, row]) => ids ? ids.includes(id) : Object.entries(where || {}).every(([key, value]) => row.metadata[key] === value)).slice(0, limit);
      return { ids: entries.map(([id]) => id), metadatas: entries.map(([, row]) => row.metadata),
        documents: entries.map(([, row]) => row.document), embeddings: entries.map(([, row]) => row.embedding) };
    },
    async upsert({ ids, metadatas, documents, embeddings }) {
      ids.forEach((id, i) => records.set(id, { metadata: metadatas[i], document: documents[i], embedding: embeddings[i] }));
    },
    async delete({ ids }) { ids.forEach(id => records.delete(id)); },
  };
}
async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sq-knowledge-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, sourceFile), lockFile = path.join(directory, ".ai-ingest.lock");
  await fs.writeFile(sourcePath, original);
  const collection = fakeCollection();
  await indexDocument({ prepared: prepareIndex({ markdown: original, sourceFile }), collection, embedDocuments: embed });
  const service = createKnowledgeUpload({ sourcePath, lockFile, openCollection: async () => collection, embedDocuments: embed, logFailure: () => {}, ...overrides });
  return { service, sourcePath, lockFile, collection, directory };
}

test("only nonempty UTF-8 Markdown within the size limit is accepted", () => {
  for (const name of ["guide.pdf", "guide.md.exe", "../guide.md", "C:\\guide.md", ""]) {
    assert.throws(() => validateUpload(name, Buffer.from(updated)), /\.md/);
  }
  assert.throws(() => validateUpload("guide.md", Buffer.alloc(0)), /trống/);
  assert.throws(() => validateUpload("guide.md", Buffer.alloc(MAX_BYTES + 1)), error => error.status === 413);
  assert.throws(() => validateUpload("guide.md", Buffer.from([0xff, 0xfe])), /UTF-8/);
  assert.throws(() => validateUpload("guide.md", Buffer.from(updated + "\x00")), /nhị phân/);
  assert.throws(() => validateUpload("guide.md", Buffer.from("# No metadata")), /Mã tài liệu/);
  assert.equal(validateUpload("Hướng dẫn.MD", Buffer.from(updated)).version, "1.1");
});

test("replacement keeps the source filename, updates RAG, and preserves other documents", async t => {
  const { service, sourcePath, lockFile, collection, directory } = await fixture(t);
  collection.records.set("other", { metadata: { documentId: "OTHER", visibility: "public" }, document: "Keep", embedding: [] });
  const result = await service.replace("a-different-name.md", Buffer.from(updated));
  assert.equal(result.state, "ready");
  assert.equal(result.sourceFile, sourceFile);
  assert.equal(await fs.readFile(sourcePath, "utf8"), updated);
  assert(collection.records.has("other"));
  assert([...collection.records.values()].filter(row => row.metadata.documentId !== "OTHER").every(row => row.metadata.version === "1.1" && row.metadata.sourceFile === sourceFile));
  assert.deepEqual(await fs.readdir(directory), [sourceFile]);
  await assert.rejects(fs.access(lockFile), { code: "ENOENT" });
  const info = await service.status();
  assert.equal(info.current.version, "1.1");
  assert.equal(info.locked, false);
});

test("wrong document ID and an existing CLI lock prevent replacement", async t => {
  const { service, sourcePath, lockFile } = await fixture(t);
  await assert.rejects(service.replace("guide.md", Buffer.from(updated.replace("SQ-KB-STUDENT-GUIDE", "OTHER"))), error => error.status === 400);
  await fs.writeFile(lockFile, "CLI owns this lock");
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), error => error.status === 409);
  assert.equal(await fs.readFile(lockFile, "utf8"), "CLI owns this lock");
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
});

test("failed embeddings preserve both original file and original index", async t => {
  const { service, sourcePath, collection } = await fixture(t, { embedDocuments: async () => { throw Error("private provider error"); } });
  const before = [...collection.records];
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), error => error.status === 503 && !error.message.includes("private"));
  assert.deepEqual([...collection.records], before);
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
  assert.equal((await service.status()).locked, false);
});

test("Chroma connection failures report the missing service and retain the original file", async t => {
  const { service, sourcePath } = await fixture(t, { openCollection: async () => {
    throw Object.assign(new Error("private database connection detail"), { name: "ChromaConnectionError" });
  } });
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), error =>
    error.status === 503 && error.message.includes("khởi động Chroma") && !error.message.includes("private"));
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
  assert.equal((await service.status()).locked, false);
});

test("Gemini quota and configuration failures have distinct safe messages", async t => {
  for (const scenario of [
    { error: { providerStatus: 429 }, expected: "hạn mức", provider: true },
    { error: { providerStatus: 403 }, expected: "quyền truy cập", provider: true },
    { error: { code: "AI_KEY_MISSING" }, expected: "GEMINI_API_KEY" },
    { error: { code: "AI_MODEL_UNSUPPORTED" }, expected: "mô hình embedding" },
    { error: { code: "AI_INDEX_MISMATCH" }, expected: "không khớp" },
  ]) {
    const fail = async () => { throw Object.assign(new Error("secret-provider-response"), scenario.error); };
    const { service } = await fixture(t, scenario.provider ? { embedDocuments: fail } : { openCollection: fail });
    await assert.rejects(service.replace("guide.md", Buffer.from(updated)), error =>
      error.message.includes(scenario.expected) && !error.message.includes("secret-provider-response"));
  }
});

test("file replacement failure rolls back the published vectors", async t => {
  const { service, sourcePath, collection } = await fixture(t, { replaceFile: async () => { throw Error("Disk failure"); } });
  const before = [...collection.records].sort();
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), /File gốc/);
  assert.deepEqual([...collection.records].sort(), before);
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
  assert.equal((await service.status()).locked, false);
});

test("a partially successful database write is rolled back", async t => {
  const { service, sourcePath, collection } = await fixture(t);
  const before = [...collection.records].sort(), upsert = collection.upsert;
  let fail = true;
  collection.upsert = async options => { await upsert(options); if (fail) { fail = false; throw Error("Lost response"); } };
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), /File gốc/);
  assert.deepEqual([...collection.records].sort(), before);
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
});

test("failed rollback retains the shared lock so chat cannot read inconsistent data", async t => {
  const { service, sourcePath, collection } = await fixture(t);
  const upsert = collection.upsert;
  collection.upsert = async options => { await upsert(options); throw Error("Database unavailable"); };
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), /Chatbot tạm khóa/);
  assert.equal((await service.status()).locked, true);
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
});

test("simultaneous uploads are serialized and identical uploads skip embedding", async t => {
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const began = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const { service } = await fixture(t, { embedDocuments: async texts => { calls++; started(); await gate; return embed(texts); } });
  const first = service.replace("guide.md", Buffer.from(updated));
  await began;
  try {
    assert.equal((await service.status()).locked, true);
    await assert.rejects(service.replace("guide.md", Buffer.from(updated)), error => error.status === 409);
  } finally { release(); }
  await first;
  const priorCalls = calls;
  assert.equal((await service.replace("guide.md", Buffer.from(updated))).skipped, true);
  assert.equal(calls, priorCalls);
});

test("collection capacity is checked before embedding or replacing the file", async t => {
  let called = false;
  const { service, collection, sourcePath } = await fixture(t, { embedDocuments: async texts => { called = true; return embed(texts); } });
  for (let i = 0; i < 1000; i++) collection.records.set(`other-${i}`, { metadata: { documentId: "OTHER", visibility: "public" } });
  await assert.rejects(service.replace("guide.md", Buffer.from(updated)), /1.000/);
  assert.equal(called, false);
  assert.equal(await fs.readFile(sourcePath, "utf8"), original);
});
