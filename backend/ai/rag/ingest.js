const { loadMarkdownSections } = require("./loaders");
const { splitText } = require("./chunking");

// Pure preparation only; callers handle access checks, embeddings and publishing.
function prepareMarkdownDocument({ documentId, version, markdown }) {
  if (!documentId || !version) throw new TypeError("Document ID and version are required.");
  return loadMarkdownSections(markdown).flatMap((section, sectionIndex) =>
    splitText(section.text).map((text, chunkIndex) => ({
      id: `${documentId}:${version}:${sectionIndex + 1}:${chunkIndex + 1}`,
      text,
      metadata: { documentId, version, section: section.title, startLine: section.startLine },
    })),
  );
}

module.exports = { prepareMarkdownDocument };
