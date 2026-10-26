const fs = require("node:fs/promises");
const path = require("node:path");
const { ChromaClient } = require("chromadb");
const { AiError } = require("./errors");
const { getAiConfig } = require("./config");
const { DIMENSIONS } = require("./providers/embeddings");
const provider = require("./providers/geminiClient");
const lockFile = path.join(__dirname, "../data/.ai-ingest.lock");

async function assertNotIndexing() {
  try { await fs.access(lockFile); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  throw new AiError("AI_INDEXING", "Kho tài liệu đang được cập nhật. Vui lòng kiểm tra lại sau khi nạp tài liệu xong.");
}

async function openCollection() {
  const config = getAiConfig();
  await assertNotIndexing();
  try {
    const client = new ChromaClient({ ...config.chroma, fetchOptions: { signal: AbortSignal.timeout(8000) } });
    const collection = await client.getCollection({ name: config.collection, embeddingFunction: null });
    if (collection.metadata?.embeddingModel !== config.embeddingModel.replace(/^models\//, "") ||
      collection.metadata?.embeddingDimensions !== DIMENSIONS) {
      throw new AiError("AI_INDEX_MISMATCH", "Cấu hình embedding chưa khớp kho tài liệu. Vui lòng liên hệ người quản trị.");
    }
    return collection;
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("AI_KNOWLEDGE_UNAVAILABLE", "Chưa kết nối được kho tài liệu. Vui lòng kiểm tra Chroma và việc nạp tài liệu.");
  }
}

function validateInventory(records) {
  if (!records.ids.length) throw new AiError("AI_KNOWLEDGE_EMPTY", "Kho tài liệu chưa có nội dung để hỏi đáp.");
  if (records.ids.length > 1000) throw new AiError("AI_INDEX_TOO_LARGE", "Kho tài liệu vượt giới hạn cấu hình hiện tại.");
  const revisions = new Map();
  for (const metadata of records.metadatas) {
    if (!metadata?.documentId || !metadata.revision || !metadata.version || !metadata.section || metadata.visibility !== "public") {
      throw new AiError("AI_INDEX_INVALID", "Kho tài liệu cần được nạp lại trước khi hỏi đáp.");
    }
    if (revisions.has(metadata.documentId) && revisions.get(metadata.documentId) !== metadata.revision) {
      throw new AiError("AI_INDEX_MIXED", "Tài liệu đang có nhiều bản chưa đồng bộ. Vui lòng hoàn tất việc nạp lại tài liệu.");
    }
    revisions.set(metadata.documentId, metadata.revision);
  }
  return records;
}

async function inventory(collection) {
  try { return validateInventory(await collection.get({ where: { visibility: "public" }, include: ["metadatas"], limit: 1001 })); }
  catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("AI_KNOWLEDGE_UNAVAILABLE", "Chưa đọc được kho tài liệu. Vui lòng kiểm tra lại kết nối Chroma.");
  }
}

async function checkKnowledge() {
  const records = await inventory(await openCollection());
  return { count: records.ids.length };
}

// Restore section context from overlapping chunks in source order.
function mergeChunks(rows) {
  const ordered = [...rows].sort((a, b) => Number(a.id.split(":").at(-2)) - Number(b.id.split(":").at(-2)));
  let text = "";
  for (const row of ordered) {
    let overlap = Math.min(text.length, row.text.length);
    while (overlap > 0 && !text.endsWith(row.text.slice(0, overlap))) overlap--;
    text += overlap ? row.text.slice(overlap) : `${text ? "\n" : ""}${row.text}`;
  }
  return text.slice(0, 4000);
}

async function search({ question, userId }, { embedQuery = provider.embedQuery } = {}) {
  if (!userId) throw new AiError("AI_AUTH_REQUIRED", "Vui lòng đăng nhập để hỏi trợ lý.", 401);
  const before = await inventory(await openCollection());
  const vector = await embedQuery(question);
  // Open after embedding to avoid reusing an expired request deadline.
  const collection = await openCollection();
  const config = getAiConfig();
  try {
    const results = await collection.query({
      queryEmbeddings: [vector], ids: before.ids,
      where: { visibility: "public" },
      nResults: Math.min(config.topK * 3, before.ids.length),
      include: ["documents", "metadatas", "distances"],
    });
    const hits = [];
    const seen = new Set();
    for (let i = 0; i < (results.ids[0] || []).length; i++) {
      const metadata = results.metadatas[0][i];
      const distance = results.distances[0][i];
      const key = JSON.stringify([metadata?.documentId, metadata?.revision, metadata?.section]);
      if (!Number.isFinite(distance) || distance > config.maxDistance || !metadata || seen.has(key)) continue;
      seen.add(key);
      hits.push({ id: results.ids[0][i], text: results.documents[0][i], metadata, distance });
      if (hits.length >= config.topK) break;
    }
    for (const hit of hits) {
      const ids = before.ids.filter((id, index) => {
        const m = before.metadatas[index];
        return m.documentId === hit.metadata.documentId && m.revision === hit.metadata.revision && m.section === hit.metadata.section;
      });
      const section = await (await openCollection()).get({ ids, where: { visibility: "public" }, include: ["documents"] });
      hit.text = mergeChunks(section.ids.map((id, index) => ({ id, text: section.documents[index] || "" })));
    }
    await assertNotIndexing();
    const after = await inventory(await openCollection());
    const currentIds = new Set(after.ids);
    if (before.ids.length !== after.ids.length || before.ids.some(id => !currentIds.has(id))) {
      throw new AiError("AI_INDEX_CHANGED", "Tài liệu vừa được cập nhật. Vui lòng gửi lại câu hỏi.");
    }
    return hits.filter(hit => hit.text);
  } catch (error) {
    if (error instanceof AiError) throw error;
    throw new AiError("AI_KNOWLEDGE_UNAVAILABLE", "Chưa tìm kiếm được tài liệu. Vui lòng kiểm tra Chroma và thử lại.");
  }
}

module.exports = { search, checkKnowledge, validateInventory, mergeChunks };
