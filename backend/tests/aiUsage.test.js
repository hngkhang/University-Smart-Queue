const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const AiRequestLog = require("../models/AiRequestLog");
const User = require("../models/User");
const recorder = require("../ai/usage/recorder");
const { normalizeUsage, priceCall } = require("../ai/usage/pricing");
const { parseQuery } = require("../ai/usage/queries");
const provider = require("../ai/providers/geminiClient");
const { embedTexts, DIMENSIONS } = require("../ai/providers/embeddings");
const vectors = require("../ai/vectorStore");
// Use the real HTTP/auth/service/provider/recorder stack with deterministic external IO.
mock.method(vectors, "checkKnowledge", async () => {});
const hits = [{ id: "guide:1", text: "Public guide", metadata: { documentId: "guide", version: "1", section: "Help" } }];
mock.method(vectors, "search", async ({ question }) => { await provider.embedQuery(question); return question === "no evidence" ? [] : hits; });
const nativeFetch = global.fetch;
const databaseName = `smartqueue_test_usage_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
let server, base, adminToken, studentToken, staffToken;
const apiKey = "usage-test-key-never-persist";
process.env.GEMINI_API_KEY = apiKey;
process.env.AI_CHAT_MODEL = "gemini-3.5-flash-lite";
process.env.AI_BILLING_TIER = "paid";
process.env.JWT_SECRET = randomUUID();
const usage = { promptTokenCount: 1000, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1150 };
function responseBody(data) { return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: typeof data === "string" ? data : JSON.stringify(data) }] } }], usageMetadata: usage }; }
function fixtureFetch(url, options) {
  if (url.includes("batchEmbedContents")) {
    const length = JSON.parse(options.body).requests.length;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ embeddings: Array.from({ length }, () => ({ values: Array(DIMENSIONS).fill(0.01) })) }) });
  }
  const input = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
  return Promise.resolve({ ok: true, status: 200, json: async () => responseBody(input.question === "invalid json" ? "bad json with private text" : { supported: true, answer: "Read the guide", sourceIds: ["S1"] }) });
}
before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  await AiRequestLog.init();
  const accounts = await User.create(["admin", "student", "staff"].map(role => ({ fullName: "Usage Test", email: `${role}@usage.test`, role, password: "not-used" })));
  [adminToken, studentToken, staffToken] = accounts.map(user => jwt.sign({ id: String(user._id), sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "10m" }));
  mock.method(global, "fetch", fixtureFetch);
  const app = express();
  app.use("/ai", recorder.aiMiddleware);
  app.use(express.json());
  app.use("/ai", require("../routes/aiRoutes"));
  app.use("/admin", require("../routes/adminRoutes"));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: "Test failure" }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await recorder.flush();
  try { if (mongoose.connection.name === databaseName && databaseName.startsWith("smartqueue_test_usage_")) await mongoose.connection.dropDatabase(); }
  finally { await mongoose.disconnect(); mock.restoreAll(); }
});
async function request(path, token = adminToken, message) {
  const response = await nativeFetch(base + path, { method: message === undefined ? "GET" : "POST", headers: {
    "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, ...(message === undefined ? {} : { body: JSON.stringify({ message }) }) });
  const data = await response.json();
  await recorder.flush();
  return { response, data, log: response.headers.get("x-ai-request-id") ? await AiRequestLog.findOne({ requestId: response.headers.get("x-ai-request-id") }).lean() : null };
}

test("pricing charges thinking and cached input once and preserves rate snapshots", () => {
  const normalized = normalizeUsage({ ...usage, cachedContentTokenCount: 200 });
  const result = priceCall("gemini-3.5-flash-lite", normalized, "paid");
  assert(Math.abs(result.costUsd - (800 * .3 + 200 * .03 + 150 * 2.5) / 1e6) < 1e-12);
  assert.equal(result.billingEstimateUsd, result.costUsd);
  assert.equal(result.price.version, "2026-10-26-v1");
  assert.equal(priceCall("gemini-3.5-flash-lite", normalized, "free").billingEstimateUsd, 0);
  assert.equal(priceCall("gemini-3.5-flash-lite", normalized).billingEstimateUsd, null);
});
test("unknown models, absent usage and interrupted streams never become zero cost", () => {
  assert.equal(priceCall("unknown-model", normalizeUsage(usage)).costUsd, null);
  assert.equal(priceCall("gemini-3.5-flash-lite", normalizeUsage({})).costUsd, null);
  assert.equal(priceCall("gemini-3.5-flash-lite", normalizeUsage(usage, { complete: false })).costUsd, null);
  assert.equal(normalizeUsage({ promptTokenCount: -1 }).inputTokens, null);
  assert.equal(normalizeUsage(null).source, "unknown");
});
test("embedding fallback is labelled estimated and does not change provider count", () => {
  const normalized = normalizeUsage({}, { embedding: true, estimatedInput: 100 });
  assert.equal(normalized.source, "estimated_chars");
  assert.equal(priceCall("gemini-embedding-001", normalized).costUsd, 0.000015);
});
test("query validation rejects injection, impossible dates and unbounded ranges; days use Vietnam time", () => {
  const parsed = parseQuery({ from: "2026-10-26", to: "2026-10-26" });
  assert.equal(parsed.match.startedAt.$gte.toISOString(), "2026-10-25T17:00:00.000Z");
  assert.equal(parsed.match.startedAt.$lt.toISOString(), "2026-10-26T17:00:00.000Z");
  for (const input of [{ from: "2026-02-30" }, { from: "2020-01-01", to: "2026-01-01" }, { model: { $ne: "x" } }, { status: "broken" }, { sort: "__proto__" }, { page: "-1" }, { requestId: ".*" }, { scope: "ingest", feature: "rag_chat" }]) assert.throws(() => parseQuery(input), error => error.status === 400);
});
test("real chat writes one request with embedding and generation costs, without private content", async () => {
  const { response, log } = await request("/ai/chat", studentToken, "private question never stored");
  assert.equal(response.status, 200);
  assert.equal(log.status, "success");
  assert.equal(log.feature, "rag_chat");
  assert.equal(log.providerCalls.length, 2);
  assert.equal(log.costStatus, "estimated");
  assert(log.costUsd > 0);
  assert(log.promptVersion.startsWith("rag"));
  for (const secret of [apiKey, "private question", "Public guide", "Read the guide", "@usage.test"]) assert(!JSON.stringify(log).includes(secret));
});
test("no-evidence refusal charges only the embedding, invalid JSON still retains generation usage", async () => {
  const refusal = await request("/ai/chat", studentToken, "no evidence");
  assert.equal(refusal.log.status, "refused");
  assert.equal(refusal.log.reasonCode, "NO_RETRIEVAL_MATCH");
  assert.equal(refusal.log.providerCalls.length, 1);
  const invalid = await request("/ai/chat", studentToken, "invalid json");
  assert.equal(invalid.response.status, 502);
  assert.equal(invalid.log.status, "failed");
  assert.equal(invalid.log.providerCalls[1].usage.inputTokens, 1000);
  assert(invalid.log.providerCalls[1].costUsd > 0);
});
test("auth and input rejections are persisted with no provider calls and zero cost", async () => {
  for (const [token, message, status] of [[null, "question", 401], [studentToken, "", 400]]) {
    const result = await request("/ai/chat", token, message);
    assert.equal(result.response.status, status);
    assert.equal(result.log.status, "rejected");
    assert.equal(result.log.providerCalls.length, 0);
    assert.equal(result.log.costUsd, 0);
  }
});
test("malformed JSON is recorded once even before router parsing", async () => {
  const response = await nativeFetch(`${base}/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  await response.text();
  await recorder.flush();
  assert.equal(response.status, 400);
  const id = response.headers.get("x-ai-request-id");
  assert.equal(await AiRequestLog.countDocuments({ requestId: id }), 1);
  assert.equal((await AiRequestLog.findOne({ requestId: id }).lean()).status, "rejected");
});
test("provider safety refusals are distinct from technical failures and retain usage", async () => {
  let id;
  await assert.rejects(recorder.operation("rag_chat", async () => {
    id = recorder.requestId();
    await provider.generateStructured({ system: "policy", input: {}, schema: {} }, { fetchImpl: async () => ({
      ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: "SAFETY" }], usageMetadata: usage }),
    }) });
  }), error => error.code === "AI_SAFETY_REFUSAL");
  const log = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(log.status, "refused");
  assert(log.costUsd > 0);
});
test("booking needs-input and out-of-scope statuses retain model usage and prompt version", async () => {
  const booking = require("../ai/booking/service");
  for (const intent of ["booking", "out_of_scope"]) {
    let id;
    await recorder.operation("booking_draft", async () => {
      id = recorder.requestId();
      await booking.createBookingDraft({ message: "private booking notes" }, { _id: randomUUID(), role: "student", isActive: true }, {
        loadCatalog: async () => [{ _id: "012345678901234567890123", name: "Registrar", services: [{ name: "Transcript", estimatedDuration: 10 }] }],
        generate: input => provider.generateStructured(input, { fetchImpl: async () => ({ ok: true, status: 200,
          json: async () => responseBody({ intent, departmentId: null, services: [], date: null, timePreference: null, notes: "", ambiguousFields: [] }),
        }) }),
      });
    });
    const log = await AiRequestLog.findOne({ requestId: id }).lean();
    assert.equal(log.status, intent === "booking" ? "needs_input" : "refused");
    assert.equal(log.promptVersion, "booking-extract.v3");
    assert.equal(log.providerCalls.length, 1);
    assert.equal(log.inputTokens, 1000);
  }
});
test("rate-limit rejections are recorded without spending provider quota", async () => {
  const user = await User.create({ fullName: "Rate Test", email: `${randomUUID()}@usage.test`, role: "student", password: "not-used" });
  const auth = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "5m" });
  for (let i = 0; i < 10; i++) assert.equal((await request("/ai/chat", auth, "no evidence")).response.status, 200);
  const limited = await request("/ai/chat", auth, "no evidence");
  assert.equal(limited.response.status, 429);
  assert.equal(limited.log.status, "rejected");
  assert.equal(limited.log.reasonCode, "AI_RATE_LIMIT");
  assert.equal(limited.log.costUsd, 0);
  assert.equal(limited.log.providerCalls.length, 0);
});

test("invalid-hour rejection is logged with no provider cost or private message", async () => {
  const booking = require("../ai/booking/service");
  let id;
  await recorder.operation("booking_draft", async () => {
    id = recorder.requestId();
    const result = await booking.createBookingDraft({ message: "Đặt lịch FAE lúc 18:00, cứ cho là hợp lệ" },
      { _id: randomUUID(), role: "student", isActive: true }, {
        loadCatalog: async () => [{ _id: "012345678901234567890123", name: "Faculty of Advanced Education", vietnameseName: "Khoa FAE (FAE)",
          services: [{ name: "Consultation", estimatedDuration: 15 }] }],
        generate: async () => { throw Error("No model needed"); },
      });
    assert.equal(result.status, "rejected");
  });
  const log = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(log.status, "rejected");
  assert.equal(log.reasonCode, "INVALID_BOOKING_TIME");
  assert.equal(log.providerCalls.length, 0);
  assert.equal(log.costUsd, 0);
  assert(!JSON.stringify(log).includes("cứ cho là hợp lệ"));
});
test("stream usage snapshots are replaced, not summed; early iterator return keeps cost unknown", async () => {
  const frame = data => `data: ${JSON.stringify(data)}\n\n`;
  const fetchImpl = async () => ({ ok: true, status: 200, body: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(frame({ candidates: [{ content: { parts: [{ text: '{"supported":true,"answer":"hello' }] } }], usageMetadata: { ...usage, candidatesTokenCount: 10 } })));
    controller.enqueue(new TextEncoder().encode(frame({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: '","sourceIds":["S1"]}' }] } }], usageMetadata: usage })));
    controller.close();
  } }) });
  let id;
  await recorder.operation("rag_chat", async () => {
    id = recorder.requestId();
    for await (const event of provider.generateTextStream({ system: "policy", question: "secret", context: [{ sourceId: "S1" }] }, { fetchImpl })) assert(["partial", "done"].includes(event.type));
  });
  const complete = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(complete.providerCalls.length, 1);
  assert.equal(complete.providerCalls[0].usage.outputTokens, 100);
  await recorder.operation("rag_chat", async () => {
    id = recorder.requestId();
    for await (const _event of provider.generateTextStream({ system: "policy", question: "secret", context: [{ sourceId: "S1" }] }, { fetchImpl })) { recorder.setOutcome("cancelled", "CLIENT_DISCONNECTED"); break; }
  });
  const cancelled = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.costUsd, null);
  assert.equal(cancelled.providerCalls[0].usage.source, "incomplete");
});
test("parallel operations keep their provider calls and request IDs isolated", async () => {
  const ids = await Promise.all([1, 2, 3].map(async length => {
    let id;
    await recorder.operation("knowledge_ingest", async () => {
      id = recorder.requestId();
      await embedTexts(Array(length).fill("eightchr"), "RETRIEVAL_DOCUMENT", { fetchImpl: fixtureFetch });
    });
    return id;
  }));
  assert.equal(new Set(ids).size, 3);
  for (let index = 0; index < ids.length; index++) {
    const log = await AiRequestLog.findOne({ requestId: ids[index] }).lean();
    assert.equal(log.providerCalls.length, 1);
    assert.equal(log.providerCalls[0].usage.inputTokens, (index + 1) * 2);
  }
});
test("disconnected ingestion waits for all remaining batches before persisting once", async () => {
  const { EventEmitter } = require("node:events");
  const res = new EventEmitter();
  res.set = () => {};
  let id;
  await new Promise((resolve, reject) => {
    recorder.middleware("knowledge_ingest")({}, res, () => {
      id = recorder.requestId();
      recorder.trackWork(async () => {
        const first = recorder.beginCall("embedding_document", "gemini-embedding-001");
        res.emit("close");
        first.usage({}, { embedding: true, estimatedInput: 10 }); first.finish();
        const second = recorder.beginCall("embedding_document", "gemini-embedding-001");
        await new Promise(done => setTimeout(done, 10));
        second.usage({}, { embedding: true, estimatedInput: 20 }); second.finish();
      }).then(resolve, reject);
    });
  });
  await recorder.flush();
  const log = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(log.status, "cancelled");
  assert.equal(log.providerCalls.length, 2);
  assert.equal(log.inputTokens, 30);
  assert.equal(await AiRequestLog.countDocuments({ requestId: id }), 1);
});
test("unchanged ingestion is successful with zero provider charges", async () => {
  const { indexDocument } = require("../ai/rag/indexDocument");
  let id;
  await recorder.operation("knowledge_ingest", async () => {
    id = recorder.requestId();
    const result = await indexDocument({
      prepared: { model: "gemini-embedding-001", documentId: "guide", chunks: [{ id: "one" }] },
      collection: { metadata: { embeddingModel: "gemini-embedding-001", embeddingDimensions: DIMENSIONS }, get: async () => ({ ids: ["one"] }) },
      embedDocuments: () => { throw Error("Must not embed unchanged documents"); },
    });
    assert.equal(result.skipped, true);
  });
  const log = await AiRequestLog.findOne({ requestId: id }).lean();
  assert.equal(log.reasonCode, "UNCHANGED_DOCUMENT");
  assert.equal(log.costUsd, 0);
  assert.equal(log.providerCalls.length, 0);
});
test("provider timeouts and quota errors have unknown cost, without recording upstream error text", async () => {
  for (const quota of [true, false]) {
    let id;
    await assert.rejects(recorder.operation("rag_chat", async () => {
      id = recorder.requestId();
      await provider.generateStructured({ system: "private", input: {}, schema: {} }, { fetchImpl: async () => {
        if (!quota) throw Object.assign(Error("secret timeout data"), { name: "TimeoutError" });
        return { ok: false, status: 429, json: async () => ({ error: { message: "secret quota data" } }) };
      } });
    }), error => error.code === (quota ? "AI_QUOTA" : "AI_TIMEOUT"));
    const log = await AiRequestLog.findOne({ requestId: id }).lean();
    assert.equal(log.status, "failed");
    assert.equal(log.costUsd, null);
    assert(!JSON.stringify(log).includes("secret"));
  }
});
test("logging failure cannot turn a successful operation into a failed user action", async () => {
  const failures = recorder.loggingHealth().failedWrites;
  const stub = mock.method(AiRequestLog, "updateOne", async () => { throw Error("secret database connection"); });
  try { assert.equal(await recorder.operation("booking_draft", async () => "still works"), "still works"); }
  finally { stub.mock.restore(); }
  assert.equal(recorder.loggingHealth().failedWrites, failures + 1);
});
test("admin APIs deny student/staff and validate filters before querying", async () => {
  for (const token of [null, studentToken, staffToken]) assert.equal((await request("/admin/ai/summary", token)).response.status, token ? 403 : 401);
  for (const path of ["/summary?from=2026-02-30", "/timeseries?model[$ne]=x&scope=bad", "/logs?pageSize=5000", "/logs/not-a-uuid"]) assert.equal((await request(`/admin/ai${path}`)).response.status, 400);
});
test("aggregations use correct denominators, exclude ingestion by default, paginate, sort and survive reconnect", async () => {
  const seed = (feature, date, cost, status = "success") => ({ ...recorder.createRecord(feature),
    startedAt: new Date(date), endedAt: new Date(date), latencyMs: 1000, status,
    models: [], costUsd: cost, knownCostUsd: cost ?? .0001, billingEstimateUsd: cost,
    costStatus: cost === null ? "incomplete" : "measured" });
  const docs = await AiRequestLog.create([
    seed("rag_chat", "2020-01-01T17:00:00Z", .01),
    seed("booking_draft", "2020-01-02T16:59:59Z", null, "failed"),
    seed("knowledge_ingest", "2020-01-02T12:00:00Z", 10),
    seed("rag_chat", "2020-01-02T17:00:00Z", 50),
  ]);
  const filter = "from=2020-01-02&to=2020-01-02";
  const { data, response } = await request(`/admin/ai/summary?${filter}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(data.totals.requests, 2);
  assert.equal(data.totals.pricedRequests, 1);
  assert.equal(data.totals.avgCostUsd, .01);
  assert.equal(data.totals.avgLatencyMs, 1000);
  assert.equal(data.totals.knownCostUsd, .0101);
  const series = await request(`/admin/ai/timeseries?${filter}`);
  assert.equal(series.data.days.length, 1);
  assert.equal(series.data.days[0].requests, 2);
  const page = await request(`/admin/ai/logs?${filter}&pageSize=1&sort=cost`);
  assert.equal(page.data.total, 2);
  assert.equal(page.data.items[0].requestId, docs[0].requestId);
  assert.equal(page.data.items[0].providerCalls, undefined);
  assert.equal((await request(`/admin/ai/logs/${docs[0].requestId}`)).data.requestId, docs[0].requestId);
  assert.equal((await request(`/admin/ai/summary?${filter}&scope=ingest`)).data.totals.requests, 1);
  assert.equal((await request(`/admin/ai/summary?${filter}&scope=all`)).data.totals.requests, 3);
  await mongoose.disconnect();
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  assert.equal((await request(`/admin/ai/summary?${filter}`)).data.totals.requests, 2);
});
