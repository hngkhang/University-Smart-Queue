// Adapted from loaders.py: supports ordinary Markdown headings, not clinic sections.
// Input is text supplied by a future authenticated ingestion service, never a URL.
function loadMarkdownSections(markdown) {
  if (typeof markdown !== "string") throw new TypeError("Markdown must be text.");
  const lines = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const sections = [];
  let title = "Nội dung";
  let startLine = 1;
  let buffer = [];
  let fence = null;
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) sections.push({ title, startLine, text });
  };
  lines.forEach((line, index) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      buffer.push(line);
      return;
    }
    const heading = !fence && line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flush();
      title = heading[1];
      startLine = index + 1;
      buffer = [];
    }
    buffer.push(line);
  });
  flush();
  return sections;
}

module.exports = { loadMarkdownSections };
