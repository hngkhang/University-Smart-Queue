const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const knowledge = require("../ai/knowledgeUpload");
const adminRoutes = require("../routes/adminRoutes");
let server, base, uploads = 0;
const secret = "knowledge-route-test-only";
const ids = { admin: "111111111111111111111111", student: "222222222222222222222222", staff: "333333333333333333333333", inactive: "444444444444444444444444" };
const oldSecret = process.env.JWT_SECRET;
const oldState = mongoose.connection.readyState;
const token = role => jwt.sign({ id: ids[role], sessionVersion: 0 }, secret);
before(async () => {
  process.env.JWT_SECRET = secret;
  mongoose.connection.readyState = 1;
  mock.method(User, "findById", id => ({ select: () => ({ lean: async () => {
    const role = Object.keys(ids).find(key => ids[key] === id);
    return role ? { _id: id, role: role === "inactive" ? "admin" : role, isActive: role !== "inactive", sessionVersion: 0 } : null;
  } }) }));
  mock.method(knowledge, "status", async () => ({ sourceFile: "fixed.md", locked: false }));
  mock.method(knowledge, "replace", async (filename, body) => {
    knowledge.validateUpload(filename, body);
    uploads++;
    return { state: "ready" };
  });
  const app = express();
  app.use(express.json());
  app.use("/admin", adminRoutes);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/admin/knowledge`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  mock.restoreAll();
  mongoose.connection.readyState = oldState;
  if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
});
const body = "# Guide\n- Mã tài liệu: SQ-KB-STUDENT-GUIDE\n- Phiên bản: 1.2\nContent.";
function request(role, options = {}) {
  return fetch(base, { method: "PUT", body, ...options, headers: {
    "Content-Type": "application/octet-stream", "X-File-Name": "guide.md",
    ...(role ? { Authorization: `Bearer ${token(role)}` } : {}), ...options.headers,
  } });
}
test("read and upload require an active admin through the real authorization middleware", async () => {
  for (const method of ["GET", "PUT"]) {
    for (const role of [undefined, "student", "staff", "inactive"]) {
      assert.equal((await request(role, { method, ...(method === "GET" ? { body: undefined } : {}) })).status, role ? 403 : 401);
    }
  }
  assert.equal(uploads, 0);
  const info = await request("admin", { method: "GET", body: undefined });
  assert.equal(info.status, 200);
  assert.equal(info.headers.get("cache-control"), "no-store");
});
test("upload enforces extension, size and request format on the server", async () => {
  assert.equal((await request("admin", { headers: { "X-File-Name": "guide.pdf" } })).status, 400);
  assert.equal((await request("admin", { headers: { "X-File-Name": "%invalid" } })).status, 400);
  assert.equal((await request("admin", { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await request("admin", { body: Buffer.alloc(knowledge.MAX_BYTES + 1) })).status, 413);
  assert.equal((await request("admin", { body: "" })).status, 400);
  assert.equal(uploads, 0);
  const response = await request("admin", { headers: { "X-File-Name": encodeURIComponent("Hướng dẫn.md") } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, "ready");
  assert.equal(uploads, 1);
});
