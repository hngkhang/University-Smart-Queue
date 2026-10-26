const provider = require("../providers/geminiClient");
const prompt = require("../prompts/ragAnswer");
const { AiError } = require("../errors");
const UNKNOWN = "Tôi chưa có đủ thông tin trong tài liệu hiện có để trả lời câu hỏi này. Bạn có thể hỏi cụ thể về dịch vụ, đặt lịch hoặc hàng đợi trên SmartQueue.";

function buildContext(hits) {
  return hits.map((hit, index) => ({
    sourceId: `S${index + 1}`, section: hit.metadata.section, text: hit.text,
  }));
}

function getCitedSources(answer, hits) {
  const labels = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))];
  if (!answer.trim() || !labels.length || labels.some((label) => label < 1 || label > hits.length)) {
    throw new AiError("AI_INVALID_SOURCES", "Chưa thể xác minh nguồn cho câu trả lời này.", 502);
  }
  // Valid IDs alone do not establish factual support; evaluation is still required.
  return labels.map((label) => {
    const hit = hits[label - 1];
    return { label, chunkId: hit.id, documentId: hit.metadata.documentId, version: hit.metadata.version,
      section: hit.metadata.section, excerpt: hit.text, sourceFile: hit.metadata.sourceFile };
  });
}

function finalizeAnswer(result, hits) {
  if (!result.supported) return { answer: UNKNOWN, sources: [], usage: result.usage };
  try {
    if (!Array.isArray(result.sourceIds) || !result.sourceIds.length || result.sourceIds.some(id =>
      typeof id !== "string" || !/^S[1-9]\d*$/.test(id) || Number(id.slice(1)) > hits.length)) {
      throw new AiError("AI_INVALID_SOURCES", "Chưa thể xác minh nguồn cho câu trả lời này.", 502);
    }
    const labels = [...new Set(result.sourceIds.map(id => Number(id.slice(1))))];
    // Render citations ourselves; section numbers in the document are not source IDs.
    const prose = result.answer.replace(/\[(?:S?\d+[\s,;]*)+\]/g, "").trim();
    if (!prose) throw new AiError("AI_INVALID_SOURCES", "Câu trả lời chưa có nội dung.", 502);
    const answer = `${prose}\n\nNguồn: ${labels.map(label => `[${label}]`).join(" ")}`;
    return { answer, sources: getCitedSources(answer, hits), usage: result.usage };
  }
  catch (error) {
    if (error.code === "AI_INVALID_SOURCES") return { answer: UNKNOWN, sources: [], usage: result.usage };
    throw error;
  }
}

async function generateAnswer(question, hits, { generateText = provider.generateText } = {}) {
  if (!hits.length) return { answer: UNKNOWN, sources: [], usage: {} };
  const result = await generateText({ system: prompt.system, question, context: buildContext(hits) });
  return finalizeAnswer(result, hits);
}

async function* generateAnswerStream(question, hits, { generateTextStream = provider.generateTextStream, signal } = {}) {
  if (!hits.length) {
    yield { type: "done", answer: UNKNOWN, sources: [], usage: {} };
    return;
  }
  for await (const event of generateTextStream({ system: prompt.system, question, context: buildContext(hits) }, { signal })) {
    if (event.type === "partial") yield event;
    if (event.type === "done") yield { type: "done", ...finalizeAnswer(event.result, hits) };
  }
}

module.exports = { buildContext, getCitedSources, generateAnswer, generateAnswerStream, finalizeAnswer, UNKNOWN };
