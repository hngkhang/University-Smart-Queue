const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { TextDecoder } = require("node:util");
const { prepareIndex, indexDocument } = require("./rag/indexDocument");
const { embedTexts } = require("./providers/embeddings");
const storage = require("./rag/storage");
const telemetry = require("./usage/recorder");

const MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_DOCUMENT_ID = "SQ-KB-STUDENT-GUIDE";
function uploadError(message, status = 400) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}
function failureMessage(error, stage) {
  if (error.publicMessage) return error.publicMessage;
  let reason;
  if (error.code === "AI_KEY_MISSING") reason = "Backend chưa cấu hình GEMINI_API_KEY.";
  else if (error.code === "AI_MODEL_UNSUPPORTED") reason = "Cấu hình mô hình embedding chưa được hỗ trợ; cần dùng gemini-embedding-001.";
  else if (error.code === "AI_INDEX_MISMATCH") reason = "Mô hình embedding không khớp với kho kiến thức hiện tại.";
  else if (error.providerStatus === 429) reason = "Gemini đã giới hạn lượt gọi hoặc hết hạn mức. Kiểm tra hạn mức API rồi thử lại.";
  else if ([401, 403].includes(error.providerStatus)) reason = "Gemini từ chối quyền truy cập. Kiểm tra API key và quyền sử dụng mô hình embedding.";
  else if (stage === "chroma") reason = "Không thể kết nối hoặc cập nhật Chroma. Hãy khởi động Chroma và kiểm tra CHROMA_HOST/CHROMA_PORT của backend.";
  else if (stage === "embedding") reason = "Không thể tạo embedding qua Gemini. Kiểm tra kết nối mạng và cấu hình Gemini rồi thử lại.";
  else if (stage === "file") reason = "Không thể đọc hoặc thay thế file tài liệu. Kiểm tra quyền ghi và dung lượng ổ đĩa trên máy chủ.";
  else reason = "Không thể cập nhật kho kiến thức. Vui lòng thử lại.";
  return `${reason} File gốc được giữ nguyên.`;
}
function validateUpload(filename, bytes) {
  if (typeof filename !== "string" || !filename || filename.length > 255 ||
      /[\\/\x00-\x1f]/.test(filename) || path.extname(filename).toLowerCase() !== ".md") {
    throw uploadError("Chỉ cho phép tải lên file có phần mở rộng .md.");
  }
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw uploadError("File tài liệu không được để trống.");
  if (bytes.length > MAX_BYTES) throw uploadError("File vượt quá giới hạn 2 MB.", 413);
  let markdown;
  try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw uploadError("File .md phải là văn bản mã hóa UTF-8."); }
  if (!markdown.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(markdown)) {
    throw uploadError("File .md phải chứa văn bản hợp lệ, không phải file nhị phân.");
  }
  try { return prepareIndex({ markdown, sourceFile: storage.sourceFile }); }
  catch { throw uploadError("Tài liệu phải có '- Mã tài liệu: ...', '- Phiên bản: ...' và từ 1 đến 1.000 đoạn nội dung."); }
}

function createKnowledgeUpload({
  sourcePath = storage.sourcePath, lockFile = storage.lockFile,
  openCollection = storage.openIngestionCollection,
  embedDocuments = texts => embedTexts(texts, "RETRIEVAL_DOCUMENT"),
  replaceFile = (from, to) => fs.rename(from, to),
  logFailure = details => console.error("Knowledge upload failed:", details),
} = {}) {
  let operation = { state: "idle", message: "Chưa có lần tải lên nào trong phiên máy chủ này." };

  async function status() {
    let current = null;
    try {
      const [markdown, stat] = await Promise.all([fs.readFile(sourcePath, "utf8"), fs.stat(sourcePath)]);
      const prepared = prepareIndex({ markdown, sourceFile: storage.sourceFile });
      current = { documentId: prepared.documentId, version: prepared.version, bytes: stat.size, updatedAt: stat.mtime.toISOString() };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    let locked = false;
    try { await fs.access(lockFile); locked = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    return { sourceFile: storage.sourceFile, maxBytes: MAX_BYTES, current,
      expectedDocumentId: current?.documentId || DEFAULT_DOCUMENT_ID,
      ...operation, locked };
  }

  async function replace(filename, bytes) {
    const prepared = validateUpload(filename, bytes);
    await fs.mkdir(path.dirname(lockFile), { recursive: true });
    let lock;
    try { lock = await fs.open(lockFile, "wx"); }
    catch (error) {
      if (error.code === "EEXIST") throw uploadError("Kho tài liệu đang được cập nhật hoặc cần khôi phục. Vui lòng kiểm tra trạng thái trước khi thử lại.", 409);
      throw error;
    }
    const tempPath = `${sourcePath}.${randomUUID()}.tmp`;
    let keepLock = false;
    let previous, collection, changed = false;
    let stage = "file";
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), source: "admin-upload" }));
      let expectedId = DEFAULT_DOCUMENT_ID;
      try {
        expectedId = prepareIndex({ markdown: await fs.readFile(sourcePath, "utf8"), sourceFile: storage.sourceFile }).documentId;
      } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (prepared.documentId !== expectedId) throw uploadError(`Giữ nguyên mã tài liệu '${expectedId}' để thay thế tài liệu hiện tại.`);
      operation = { state: "processing", message: "Đang xử lý tài liệu và cập nhật kiến thức cho chatbot." };
      await fs.mkdir(path.dirname(sourcePath), { recursive: true });
      await fs.writeFile(tempPath, bytes, { flag: "wx" });
      stage = "chroma";
      collection = await openCollection();
      // The chat reader limits the whole public collection to 1,000 chunks.
      const inventory = await collection.get({ where: { visibility: "public" }, include: ["metadatas"], limit: 1001 });
      const otherCount = inventory.metadatas.filter(item => item.documentId !== prepared.documentId).length;
      if (inventory.ids.length > 1000 || otherCount + prepared.chunks.length > 1000) {
        throw uploadError("Kho kiến thức sau cập nhật vượt giới hạn 1.000 đoạn. Hãy rút gọn tài liệu.");
      }
      previous = await collection.get({ where: { documentId: prepared.documentId }, include: ["metadatas", "documents", "embeddings"] });
      const guarded = { ...collection,
        upsert: async options => { stage = "chroma"; changed = true; return collection.upsert(options); },
        delete: async options => { stage = "chroma"; changed = true; return collection.delete(options); },
      };
      const result = await indexDocument({ prepared, collection: guarded, embedDocuments: async texts => {
        stage = "embedding";
        const vectors = await embedDocuments(texts);
        stage = "chroma";
        return vectors;
      } });
      // Rename in the same directory only after the new index has been verified.
      stage = "file";
      await replaceFile(tempPath, sourcePath);
      operation = { state: "ready", message: "Đã thay thế tài liệu và cập nhật kiến thức cho chatbot." };
      return { ...operation, sourceFile: storage.sourceFile, version: prepared.version, count: result.count, skipped: result.skipped };
    } catch (error) {
      telemetry.setOutcome(error.publicMessage && error.status < 500 ? "rejected" : "failed", "AI_INGEST_FAILED");
      if (changed) {
        try {
          // Restore the previous vectors, including after a partially successful database write.
          for (let i = 0; i < previous.ids.length; i += 20) {
            await collection.upsert({ ids: previous.ids.slice(i, i + 20),
              documents: previous.documents.slice(i, i + 20), metadatas: previous.metadatas.slice(i, i + 20),
              embeddings: previous.embeddings.slice(i, i + 20) });
          }
          const oldIds = new Set(previous.ids);
          const newIds = prepared.chunks.map(chunk => chunk.id).filter(id => !oldIds.has(id));
          if (newIds.length) await collection.delete({ ids: newIds });
          const restored = await collection.get({ where: { documentId: prepared.documentId }, include: ["metadatas"] });
          if (restored.ids.length !== oldIds.size || restored.ids.some(id => !oldIds.has(id))) throw new Error("Rollback verification failed");
        } catch {
          keepLock = true;
        }
      }
      const message = keepLock
        ? "Cập nhật thất bại và chưa khôi phục được kho kiến thức. File gốc vẫn được giữ. Chatbot tạm khóa; quản trị máy chủ cần nạp lại file gốc."
        : failureMessage(error, stage);
      // Log bounded diagnostic fields, never upstream messages, document text or API keys.
      logFailure({ stage, code: error.code, name: error.name, providerStatus: error.providerStatus,
        causeCode: error.cause?.code, recoveryRequired: keepLock });
      operation = { state: "failed", message };
      throw uploadError(message, error.status || 503);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      await lock.close();
      if (!keepLock) await fs.unlink(lockFile);
    }
  }
  return { status, replace };
}

module.exports = { MAX_BYTES, validateUpload, createKnowledgeUpload, ...createKnowledgeUpload() };
