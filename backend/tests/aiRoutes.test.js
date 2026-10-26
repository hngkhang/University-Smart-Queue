const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const User = require("../models/User");
const service = require("../ai/service");
const { AiError } = require("../ai/errors");
const databaseName = `smartqueue_test_ai_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const originalAnswer = service.answerQuestion;
process.env.JWT_SECRET = randomUUID();
let server, base;

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", {
    dbName: databaseName, serverSelectionTimeoutMS: 10000,
  });
  mock.method(service, "getStatus", async () => ({ state: "ready", canChat: true, message: "Ready" }));
  mock.method(service, "answerQuestion", async (body, user) => {
    if (!body.message || body.message.length > 2000) return originalAnswer(body, user);
    if (body.message === "timeout") throw new AiError("AI_TIMEOUT", "Try later", 504);
    return { answer: "Public guide [1]", sources: [{ label: 1, section: "Guide", version: "1.0", chunkId: "guide-1", documentId: "guide" }] };
  });
  const app = express();
  app.use(express.json());
  app.use("/ai", require("../routes/aiRoutes"));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/ai`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("smartqueue_test_ai_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); mock.restoreAll(); }
});

async function account(isActive = true) {
  const user = await User.create({ fullName: "AI Test", email: `${randomUUID()}@example.test`, password: "not-used", role: "student", isActive });
  return jwt.sign({ id: String(user._id), sessionVersion: 0 }, process.env.JWT_SECRET, { expiresIn: "5m" });
}
async function chat(message, token) {
  return fetch(`${base}/chat`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ message }) });
}

test("public readiness awaits async checks and never caches the result", async () => {
  const response = await fetch(`${base}/status`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).canChat, true);
});

test("chat requires a valid active account", async () => {
  assert.equal((await chat("question")).status, 401);
  assert.equal((await chat("question", "invalid")).status, 401);
  assert.equal((await chat("question", await account(false))).status, 403);
});

test("active accounts receive citations, validation errors and bounded provider failures", async () => {
  const token = await account();
  const response = await chat("question", token);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sources[0].label, 1);
  assert.equal((await chat("", token)).status, 400);
  const timeout = await chat("timeout", token);
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).code, "AI_TIMEOUT");
});
