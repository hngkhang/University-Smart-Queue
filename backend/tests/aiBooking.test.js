const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { normalizeDraft, createBookingDraft } = require("../ai/booking/service");
const { generateStructured } = require("../ai/providers/geminiClient");
const { bookingJsonSchema } = require("../ai/booking/schema");
const { AiError } = require("../ai/errors");

process.env.GEMINI_API_KEY = "unit-test-key";
const now = new Date("2026-10-25T10:00:00+07:00");
const catalog = [{ _id: "012345678901234567890123", name: "Registrar", vietnameseName: "Phòng đào tạo",
  services: [{ name: "Transcript Request", estimatedDuration: 10 }, { name: "Verification", estimatedDuration: 15 }] }];
const valid = () => ({ intent: "booking", departmentId: catalog[0]._id, services: ["Transcript Request"], date: "2026-10-26",
  timePreference: { period: "morning", time: "09:00" }, notes: "", ambiguousFields: [] });
const student = () => ({ _id: randomUUID(), role: "student", isActive: true });

test("schema rejects malformed, missing, extra and wrongly typed model fields", () => {
  for (const data of [null, {}, { ...valid(), studentId: "someone-else" }, { ...valid(), services: "Transcript Request" },
    { ...valid(), notes: "x".repeat(1001) }, { ...valid(), timePreference: { period: "night", time: "25:00" } },
    { ...valid(), intent: "cancel" }, { ...valid(), date: "tomorrow" }]) {
    assert.throws(() => normalizeDraft(data, catalog, now), error => error.code === "AI_INVALID_DRAFT");
  }
});

test("valid structured data resolves exact live catalog names without inventing booking state", () => {
  const result = normalizeDraft(valid(), catalog, now);
  assert.equal(result.status, "ready");
  assert.equal(result.draft.departmentName, "Phòng đào tạo");
  assert.equal(result.draft.timePreference.time, "09:00");
  assert.equal(result.draft.startsAt, undefined);
  assert.equal(result.draft.studentId, undefined);
  assert.deepEqual(result.missingFields, []);
});

test("hallucinated IDs/services and mixed departments cannot silently book a subset", () => {
  let result = normalizeDraft({ ...valid(), departmentId: "ffffffffffffffffffffffff" }, catalog, now);
  assert.equal(result.draft.departmentId, null);
  assert.deepEqual(result.draft.services, []);
  result = normalizeDraft({ ...valid(), services: ["Transcript Request", "Invented"] }, catalog, now);
  assert.deepEqual(result.draft.services, []);
  assert.equal(result.status, "needs_input");
  result = normalizeDraft({ ...valid(), ambiguousFields: ["departmentId"] }, catalog, now);
  assert.equal(result.draft.departmentId, null);
});

test("missing and ambiguous values stay empty for manual review", () => {
  const result = normalizeDraft({ ...valid(), ambiguousFields: ["services", "date", "timePreference"] }, catalog, now);
  assert.deepEqual(result.missingFields, ["services", "date"]);
  assert.equal(result.draft.date, null);
  assert.equal(result.draft.timePreference, null);
  const partial = normalizeDraft({ ...valid(), departmentId: null, services: [], date: null }, catalog, now);
  assert.equal(partial.status, "needs_input");
});

test("past, impossible and distant dates are cleared; non-working days require correction", () => {
  for (const date of ["2000-01-01", "2026-02-30", "2099-01-01", "2026-11-25"]) {
    const result = normalizeDraft({ ...valid(), date }, catalog, now);
    assert.equal(result.draft.date, null);
    assert.ok(result.missingFields.includes("date"));
  }
  const closed = normalizeDraft({ ...valid(), date: "2026-10-31" }, catalog, now);
  assert.equal(closed.status, "needs_input");
  assert.ok(closed.warnings.length);
  const excluded = normalizeDraft(valid(), [{ ...catalog[0], bookingExcludedDates: ["2026-10-26"] }], now);
  assert.equal(excluded.status, "needs_input");
});

test("out-of-scope output never exposes a draft even if model filled fields", () => {
  assert.equal(normalizeDraft({ ...valid(), intent: "out_of_scope" }, catalog, now).draft, null);
});

test("service bounds requests, sends only public catalog data and does not require Chroma", async () => {
  const user = student();
  let called = false;
  const result = await createBookingDraft({ message: "Xin bảng điểm ngày mai" }, user, {
    now, loadCatalog: async () => [{ ...catalog[0], staff: ["private"], secret: "private" }],
    generate: async payload => {
      called = true;
      assert.equal(payload.input.referenceDate, "2026-10-25");
      assert.equal(payload.input.timeZone, "Asia/Ho_Chi_Minh");
      assert(!JSON.stringify(payload.input).includes("private"));
      assert(!JSON.stringify(payload.input).includes(user._id));
      assert.equal(payload.jsonSchema, true);
      return { data: valid(), usage: { totalTokenCount: 50 } };
    },
  });
  assert(called);
  assert.equal(result.status, "ready");
  for (const message of ["", " ", null, "x".repeat(2001)]) {
    await assert.rejects(createBookingDraft({ message }, user), error => error.status === 400);
  }
  await assert.rejects(createBookingDraft({ message: "book" }, { ...user, role: "staff" }), error => error.status === 403);
  await assert.rejects(createBookingDraft({ message: "book" }, user, { loadCatalog: async () => [] }), error => error.code === "AI_NO_BOOKING_SERVICES");
});

test("one in-flight request per user; failure releases lock and preserves controlled errors", async () => {
  const user = student();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const pending = createBookingDraft({ message: "book" }, user, { now, loadCatalog: async () => catalog,
    generate: async () => { await waiting; throw new AiError("AI_TIMEOUT", "Try later", 504); } });
  await assert.rejects(createBookingDraft({ message: "book" }, user), error => error.status === 429);
  release();
  await assert.rejects(pending, error => error.status === 504);
  const result = await createBookingDraft({ message: "book" }, user, { now, loadCatalog: async () => catalog, generate: async () => ({ data: valid() }) });
  assert.equal(result.status, "ready");
});

test("provider uses JSON schema and rejects malformed/truncated responses without secrets", async () => {
  const payload = { system: "trusted", input: { message: "untrusted" }, schema: bookingJsonSchema, jsonSchema: true };
  const result = await generateStructured(payload, { fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return { ok: true, json: async () => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(valid()) }] } }] }) };
  } });
  assert.deepEqual(result.data, valid());
  for (const candidate of [{ finishReason: "MAX_TOKENS" }, { finishReason: "STOP", content: { parts: [{ text: "not-json" }] } }]) {
    await assert.rejects(generateStructured(payload, { fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [candidate] }) }) }), error => error.status === 502);
  }
  await assert.rejects(generateStructured(payload, { fetchImpl: async () => { throw Error("secret-key-in-upstream-error"); } }),
    error => !error.message.includes("secret-key"));
});
