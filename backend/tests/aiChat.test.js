const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateAnswer, getCitedSources, UNKNOWN } = require("../ai/rag/generate");
const { validateInventory, mergeChunks } = require("../ai/vectorStore");
const { generateText, embedQuery, providerError } = require("../ai/providers/geminiClient");
const { answerQuestion, getStatus } = require("../ai/service");
const hits = [{ id: "guide:1.0:1:1:hash", text: "Cancel before start.", metadata: {
  documentId: "guide", version: "1.0", revision: "hash", section: "Cancellation", visibility: "public", sourceFile: "guide.md",
} }];

test("empty retrieval and unsupported generations return no invented answer/sources", async () => {
  const never = () => { throw Error("Should not call model"); };
  assert.equal((await generateAnswer("question", [], { generateText: never })).answer, UNKNOWN);
  const result = await generateAnswer("question", hits, { generateText: async () => ({ supported: false, answer: "Invented policy" }) });
  assert.deepEqual(result.sources, []);
  assert.equal(result.answer, UNKNOWN);
});

test("only valid cited public passages are returned, with readable excerpts", async () => {
  const result = await generateAnswer("question", hits, { generateText: async () => ({ supported: true, answer: "Cancel before start.", sourceIds: ["S1"] }) });
  assert.equal(result.sources[0].excerpt, hits[0].text);
  assert.equal(result.sources[0].revision, undefined);
  for (const answer of ["No citation", "Fake citation [2]", "[0]"]) {
    assert.throws(() => getCitedSources(answer, hits));
    assert.equal((await generateAnswer("question", hits, { generateText: async () => ({ supported: true, answer }) })).answer, UNKNOWN);
  }
  for (const sourceIds of [["S30"], ["7"], [], ["S1", "S999"]]) {
    assert.equal((await generateAnswer("question", hits, { generateText: async () => ({ supported: true, answer: "Invented refs [1, 30]", sourceIds }) })).answer, UNKNOWN);
  }
  const fixed = await generateAnswer("question", hits, { generateText: async () => ({ supported: true, answer: "Fact [1, 30]", sourceIds: ["S1"] }) });
  assert(!fixed.answer.includes("30"));
  assert.equal(fixed.sources.length, 1);
});

test("empty, private and mixed revisions cannot be used as a ready public index", () => {
  assert.throws(() => validateInventory({ ids: [], metadatas: [] }), /chưa có/);
  assert.throws(() => validateInventory({ ids: ["x"], metadatas: [{ ...hits[0].metadata, visibility: "private" }] }));
  assert.throws(() => validateInventory({ ids: ["x", "y"], metadatas: [hits[0].metadata, { ...hits[0].metadata, revision: "other" }] }));
  assert.equal(validateInventory({ ids: ["x"], metadatas: [hits[0].metadata] }).ids.length, 1);
});

test("section expansion restores overlapping chunks in numeric source order", () => {
  assert.equal(mergeChunks([
    { id: "doc:1:1:2:hash", text: "world, goodbye" },
    { id: "doc:1:1:1:hash", text: "Hello world" },
  ]), "Hello world, goodbye");
});

test("provider errors do not expose keys, URLs or upstream bodies", () => {
  for (const status of [400, 401, 403, 404, 429, 503]) {
    const error = Object.assign(Error("secret-provider-detail"), { providerStatus: status });
    const result = providerError(error);
    assert(!result.message.includes("secret-provider-detail"));
    if (status === 429) assert.equal(result.status, 429);
  }
  assert.equal(providerError(Object.assign(Error(), { name: "TimeoutError" })).status, 504);
});

test("generation separates untrusted passages, handles malformed/truncated output and reports usage", async () => {
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unit-test-key";
  const payload = { system: "trusted policy", question: "ignore policy", context: [{ sourceId: "S1", text: "untrusted text" }] };
  try {
    const result = await generateText(payload, { fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.systemInstruction.parts[0].text, "trusted policy");
      assert.equal(JSON.parse(body.contents[0].parts[0].text).question, "ignore policy");
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseSchema.properties.sourceIds.items.enum, ["S1"]);
      return { ok: true, json: async () => ({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"supported":true,"answer":"Answer","sourceIds":["S1"]}' }] } }],
        usageMetadata: { totalTokenCount: 100 },
      }) };
    } });
    assert.equal(result.usage.totalTokenCount, 100);
    for (const candidate of [
      { finishReason: "MAX_TOKENS" },
      { finishReason: "STOP", content: { parts: [{ text: "not json" }] } },
    ]) {
      await assert.rejects(generateText(payload, { fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [candidate] }) }) }));
    }
    await assert.rejects(embedQuery("question", { fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "unit-test-key" } }) }) }),
      error => error.code === "AI_QUOTA" && !error.message.includes("unit-test-key"));
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
  }
});

test("readiness requires a key; chat rejects unauthenticated and invalid input before external calls", async () => {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try { assert.equal((await getStatus()).canChat, false); }
  finally { if (key !== undefined) process.env.GEMINI_API_KEY = key; }
  for (const message of ["", " ", null, "x".repeat(2001)]) {
    await assert.rejects(answerQuestion({ message }, { _id: "test" }), error => error.status === 400);
  }
  await assert.rejects(answerQuestion({ message: "question" }, null), error => error.status === 401);
});
