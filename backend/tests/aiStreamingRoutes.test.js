const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const service = require("../ai/service");
const { AiError } = require("../ai/errors");

// Exercise the HTTP streaming boundary without a database or an external AI request.
const authPath = require.resolve("../middleware/requireRole");
require(authPath);
const originalAuth = require.cache[authPath].exports;
require.cache[authPath].exports = () => (req, _res, next) => {
  req.user = { _id: "test-user", isActive: true };
  next();
};
mock.method(service, "streamQuestion", async function* (body) {
  if (body.message === "early-error") throw new AiError("AI_INVALID_INPUT", "Bad question", 400);
  yield { type: "partial", answer: "Xin " };
  if (body.message === "late-error") throw new AiError("AI_TIMEOUT", "Try later", 504);
  yield { type: "done", answer: "Xin bảng điểm.\n\nNguồn: [1]", sources: [{ label: 1 }] };
});
const router = require("../routes/aiRoutes");
require.cache[authPath].exports = originalAuth;

let server;
let base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/ai", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/ai`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  mock.restoreAll();
});

async function chat(message) {
  return fetch(`${base}/chat/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
}

test("stream endpoint sends incremental NDJSON then final cited answer", async () => {
  const response = await chat("question");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map(event => event.type), ["partial", "done"]);
  assert.equal(events[1].sources[0].label, 1);
});

test("errors before and after streaming remain understandable to the client", async () => {
  const early = await chat("early-error");
  assert.equal(early.status, 400);
  assert.equal((await early.json()).code, "AI_INVALID_INPUT");
  const late = await chat("late-error");
  assert.equal(late.status, 200);
  const events = (await late.text()).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map(event => event.type), ["partial", "error"]);
  assert.equal(events[1].code, "AI_TIMEOUT");
});
