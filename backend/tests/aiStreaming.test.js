const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateTextStream, partialAnswer } = require("../ai/providers/geminiClient");
const { generateAnswerStream, UNKNOWN } = require("../ai/rag/generate");

const hit = { id: "guide:1.0:1:1:hash", text: "Cancel before start.", metadata: {
  documentId: "guide", version: "1.0", revision: "hash", section: "Cancellation", visibility: "public", sourceFile: "guide.md",
} };

function streamResponse(frames) {
  const payload = frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("");
  const bytes = new TextEncoder().encode(payload);
  return new Response(new ReadableStream({
    start(controller) {
      // Split inside SSE framing, JSON escapes and UTF-8 characters.
      for (let offset = 0; offset < bytes.length; offset += 7) controller.enqueue(bytes.slice(offset, offset + 7));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

test("streamed structured answer exposes only decoded answer text and finishes with validated citations", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const fragments = [
      '{"supported":true,"answer":"Xin ',
      'bảng điểm \\u1edf ',
      'phòng đào tạo.","sourceIds":["S1"]}',
    ];
    const frames = fragments.map((text, index) => ({
      candidates: [{ content: { parts: [{ text }] }, ...(index === 2 ? { finishReason: "STOP" } : {}) }],
      ...(index === 2 ? { usageMetadata: { totalTokenCount: 42 } } : {}),
    }));
    const fetchImpl = async (url, options) => {
      assert.match(url, /:streamGenerateContent\?alt=sse$/);
      assert.equal(options.headers["x-goog-api-key"], "test-key");
      const body = JSON.parse(options.body);
      assert.deepEqual(body.generationConfig.responseSchema.propertyOrdering, ["supported", "answer", "sourceIds"]);
      return streamResponse(frames);
    };
    const providerEvents = await collect(generateTextStream({ system: "policy", question: "where?", context: [{ sourceId: "S1", text: hit.text }] }, { fetchImpl }));
    assert(providerEvents.some(event => event.type === "partial" && event.answer === "Xin "));
    assert(providerEvents.some(event => event.type === "partial" && event.answer.includes("ở phòng")));
    assert(providerEvents.every(event => event.type !== "partial" || !event.answer.includes("sourceIds")));
    assert.equal(providerEvents.at(-1).result.usage.totalTokenCount, 42);

    const rendered = await collect(generateAnswerStream("where?", [hit], {
      generateTextStream: async function* () { yield* providerEvents; },
    }));
    assert.equal(rendered.at(-1).answer, "Xin bảng điểm ở phòng đào tạo.\n\nNguồn: [1]");
    assert.equal(rendered.at(-1).sources[0].chunkId, hit.id);
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

test("partial JSON escapes and unsupported or invalid citations never become a final unsupported answer", async () => {
  assert.equal(partialAnswer('{"supported":true,"answer":"a\\'), "a");
  assert.equal(partialAnswer('{"supported":true,"answer":"a\\u1'), "a");
  assert.equal(partialAnswer('{"supported":false,"answer":"invented'), "");
  const unsupported = await collect(generateAnswerStream("question", [hit], {
    generateTextStream: async function* () {
      yield { type: "partial", answer: "draft" };
      yield { type: "done", result: { supported: false, answer: "invented", sourceIds: [], usage: {} } };
    },
  }));
  assert.equal(unsupported.at(-1).answer, UNKNOWN);
  const badSource = await collect(generateAnswerStream("question", [hit], {
    generateTextStream: async function* () {
      yield { type: "done", result: { supported: true, answer: "invented", sourceIds: ["S99"], usage: {} } };
    },
  }));
  assert.equal(badSource.at(-1).answer, UNKNOWN);
});

test("missing STOP or malformed final JSON fails instead of committing a partial answer", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  const payload = { system: "policy", question: "question", context: [{ sourceId: "S1", text: hit.text }] };
  try {
    await assert.rejects(collect(generateTextStream(payload, { fetchImpl: async () => streamResponse([
      { candidates: [{ content: { parts: [{ text: '{"supported":true,"answer":"partial' }] } }] },
    ]) })), error => error.code === "AI_INCOMPLETE_ANSWER");
    await assert.rejects(collect(generateTextStream(payload, { fetchImpl: async () => streamResponse([
      { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not-json" }] } }] },
    ]) })), error => error.code === "AI_INVALID_ANSWER");
  } finally {
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
