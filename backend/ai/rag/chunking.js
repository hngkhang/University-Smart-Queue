const { getAiConfig } = require("../config");

// Like the midterm chunker, these limits are CHARACTERS, not tokens.
function splitText(text, options = {}) {
  const config = getAiConfig();
  const size = options.size ?? config.chunkSize;
  const overlap = options.overlap ?? config.chunkOverlap;
  if (!Number.isSafeInteger(size) || size < 1 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= size) {
    throw new RangeError("Require 0 <= overlap < size, measured in characters.");
  }
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + size, normalized.length);
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf("\n\n", end - 2);
      if (boundary > start + Math.floor(size / 2)) end = boundary + 2;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

module.exports = { splitText };
