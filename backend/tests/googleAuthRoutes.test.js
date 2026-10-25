const { test, before, after, mock } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, randomBytes } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config({ quiet: true });
const User = require("../models/User");
const Transaction = require("../models/OAuthTransaction");
const google = require("../lib/googleOAuth");
const { issueSession } = require("../lib/authSession");
const dbName = `smartqueue_test_google_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
let server, base, passwordHash, providerClaims, verifyCalls = 0;
const password = "Google-test-password-123";
const random = () => randomBytes(32).toString("base64url");

before(async () => {
  Object.assign(process.env, { JWT_SECRET: random(), GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-secret", GOOGLE_CALLBACK_URL: "http://127.0.0.1:5000/api/auth/google/callback",
    CLIENT_URL: "http://localhost:5173", NODE_ENV: "test" });
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue",
    { dbName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Transaction.init()]);
  passwordHash = await bcrypt.hash(password, 4);
  mock.method(google, "verifyCode", async (_config, code, transaction) => {
    assert.equal(code, "google-code");
    assert.equal(transaction.verifier.length, 43);
    assert.equal(transaction.nonce.length, 43);
    verifyCalls++;
    return providerClaims;
  });
  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("../routes/authRoutes"));
  app.use("/api/admin", require("../routes/adminRoutes"));
  for (const role of ["student", "staff", "admin"]) app.get(`/check/${role}`, require("../middleware/requireRole")(role), (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  mock.restoreAll();
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName && dbName.startsWith("smartqueue_test_google_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

async function account(overrides = {}) {
  return User.create({ fullName: "Google Student", email: `${randomUUID()}@gmail.com`, role: "student", studentID: randomUUID(), password: passwordHash, ...overrides });
}
function claimsFor(user, overrides = {}) {
  providerClaims = { sub: `google-${user._id}`, email: user.email, email_verified: true, ...overrides };
}
async function request(path, { body, token, cookie, method } = {}) {
  return fetch(base + path, { method: method || (body ? "POST" : "GET"), redirect: "manual",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
async function begin(rememberMe = false) {
  const verifier = random();
  const response = await request(`/api/auth/google?challenge=${google.hash(verifier)}&rememberMe=${rememberMe}&role=admin`);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return { verifier, cookie: cookie.split(";")[0], state: location.searchParams.get("state"), nonce: location.searchParams.get("nonce") };
}
async function callback(flow, query = "code=google-code", cookie = flow.cookie) {
  const response = await request(`/api/auth/google/callback?state=${flow.state}&${query}`, { cookie });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "http://localhost:5173");
  assert.equal(location.pathname, "/auth/google/callback");
  assert.equal(location.search, "");
  return new URLSearchParams(location.hash.slice(1));
}
const exchange = (flow, code, verifier = flow.verifier) => request("/api/auth/google/exchange", { body: { code, verifier, role: "admin" } });
async function loginGoogle(user, remember = false) {
  claimsFor(user);
  const flow = await begin(remember);
  const result = await callback(flow);
  assert.ok(result.get("code"), result.toString());
  return { flow, code: result.get("code") };
}

test("student Google login links the subject, issues JWT and enforces all three roles", async () => {
  const student = await account();
  const { flow, code } = await loginGoogle(student, true);
  const response = await exchange(flow, code);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.role, "student");
  assert.equal(data.rememberMe, true);
  assert.equal(data.user.id, String(student._id));
  for (const field of ["password", "googleId", "sessionVersion"]) assert.equal(field in data.user, false);
  const payload = jwt.verify(data.token, process.env.JWT_SECRET);
  assert.equal(payload.authMethod, "google");
  assert.equal(payload.exp - payload.iat, 604800);
  assert.equal((await User.findById(student._id).select("+googleId")).googleId, `google-${student._id}`);
  assert.equal((await request("/check/student", { token: data.token })).status, 200);
  assert.equal((await request("/check/staff", { token: data.token })).status, 403);
  assert.equal((await request("/check/admin", { token: data.token })).status, 403);
  const session = await request("/api/auth/session", { token: data.token });
  assert.equal((await session.json()).user.role, "student");
});

test("staff, admin and disabled accounts never receive a Google session or change roles", async () => {
  const count = await User.countDocuments();
  const actors = [await account({ role: "staff" }), await account({ role: "admin" }), await account({ isActive: false })];
  for (const actor of actors) {
    claimsFor(actor);
    const result = await callback(await begin());
    assert.equal(result.get("code"), null);
    assert.equal(result.get("error"), actor.isActive === false ? "account_disabled" : "role_conflict");
    assert.equal((await User.findById(actor._id)).role, actor.role);
    if (actor.role) assert.equal((await User.findById(actor._id).select("+googleId")).googleId, undefined);
  }
  assert.equal(await User.countDocuments(), count + 3);
});

test("first Google sign-in creates a passwordless student and subsequent sign-in reuses it", async () => {
  const identity = { _id: new mongoose.Types.ObjectId(), email: `${randomUUID()}@gmail.com` };
  const beforeCount = await User.countDocuments();
  let userId;
  for (let i = 0; i < 2; i++) {
    claimsFor(identity, { name: "New Google Student", role: "admin", department: "untrusted", studentID: "untrusted" });
    const flow = await begin();
    const result = await callback(flow);
    assert.ok(result.get("code"), result.toString());
    const response = await exchange(flow, result.get("code"));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.user.role, "student");
    assert.equal(data.user.fullName, "New Google Student");
    assert.equal(data.user.studentID, "");
    assert.equal(data.user.department, null);
    if (userId) assert.equal(data.user.id, userId);
    userId = data.user.id;
    assert.equal((await request("/check/student", { token: data.token })).status, 200);
    assert.equal((await request("/check/admin", { token: data.token })).status, 403);
  }
  assert.equal(await User.countDocuments(), beforeCount + 1);
  assert.equal((await User.findById(userId).select("+password")).password, undefined);
  assert.equal((await request("/api/auth/login", { body: { email: identity.email, password: "anything" } })).status, 401);
});

test("simultaneous first Google sign-ins create one student account", async () => {
  const identity = { _id: new mongoose.Types.ObjectId(), email: `${randomUUID()}@gmail.com` };
  claimsFor(identity);
  const flows = await Promise.all([begin(), begin()]);
  const callbacks = await Promise.all(flows.map((flow) => callback(flow)));
  const responses = await Promise.all(callbacks.map((result, index) => {
    assert.ok(result.get("code"), result.toString());
    return exchange(flows[index], result.get("code"));
  }));
  const data = await Promise.all(responses.map(async (response) => {
    assert.equal(response.status, 200);
    return response.json();
  }));
  assert.equal(data[0].user.id, data[1].user.id);
  assert.equal(await User.countDocuments({ email: identity.email }), 1);
});

test("new verified third-party Google identity can register without linking another account", async () => {
  const identity = { _id: new mongoose.Types.ObjectId(), email: `${randomUUID()}@example.test` };
  const { flow, code } = await loginGoogle(identity);
  const response = await exchange(flow, code);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.role, "student");
  assert.equal(data.user.fullName, identity.email.split("@")[0]);
});

test("unverified Google identity cannot create a student account", async () => {
  const identity = { _id: new mongoose.Types.ObjectId(), email: `${randomUUID()}@gmail.com` };
  claimsFor(identity, { email_verified: false });
  assert.equal((await callback(await begin())).get("error"), "google_failed");
  assert.equal(await User.countDocuments({ email: identity.email }), 0);
});

test("state is browser-bound, expires and cannot be replayed", async () => {
  const student = await account();
  claimsFor(student);
  const flow = await begin();
  const beforeCalls = verifyCalls;
  assert.equal((await callback(flow, undefined, "")).get("error"), "invalid_state");
  assert.equal((await callback(flow, undefined, `smartqueue_google_state=${random()}`)).get("error"), "invalid_state");
  assert.equal(verifyCalls, beforeCalls);
  assert.ok((await callback(flow)).get("code"));
  assert.equal((await callback(flow)).get("error"), "invalid_state");
  const expired = await begin();
  await Transaction.updateOne({ tokenHash: google.hash(expired.state) }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await callback(expired)).get("error"), "invalid_state");
});

test("Google denial consumes state and safely reports cancellation", async () => {
  const flow = await begin();
  assert.equal((await callback(flow, "error=access_denied")).get("error"), "access_denied");
  assert.equal((await callback(flow)).get("error"), "invalid_state");
});

test("exchange requires the initiating tab's verifier and allows exactly one concurrent winner", async () => {
  const { flow, code } = await loginGoogle(await account());
  assert.equal((await exchange(flow, code, random())).status, 401);
  const results = await Promise.all([exchange(flow, code), exchange(flow, code)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
  assert.equal((await exchange(flow, code)).status, 401);
});

test("exchange rejects expired handoffs and malformed input", async () => {
  const { flow, code } = await loginGoogle(await account());
  await Transaction.updateOne({ tokenHash: google.hash(code) }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await exchange(flow, code)).status, 401);
  assert.equal((await exchange(flow, "invalid")).status, 400);
  assert.equal((await request("/api/auth/google?challenge=invalid")).status, 400);
});

test("role changes, deactivation and session revocation between callback and exchange are rejected", async () => {
  for (const [change, expected] of [[{ role: "staff" }, 403], [{ role: "admin" }, 403], [{ isActive: false }, 403], [{ sessionVersion: 1 }, 401]]) {
    const student = await account();
    const { flow, code } = await loginGoogle(student);
    await User.updateOne({ _id: student._id }, { $set: change });
    assert.equal((await exchange(flow, code)).status, expected);
  }
});

test("Google JWT cannot gain staff access after a direct database role change", async () => {
  const student = await account();
  const { flow, code } = await loginGoogle(student);
  const { token } = await (await exchange(flow, code)).json();
  await User.updateOne({ _id: student._id }, { role: "staff" });
  assert.equal((await request("/check/staff", { token })).status, 403);
  assert.equal((await request("/api/auth/session", { token })).status, 403);
});

test("initial link rejects third-party emails and mismatched subjects; Workspace email is accepted", async () => {
  const user = await account({ email: `${randomUUID()}@school.example` });
  claimsFor(user);
  assert.equal((await callback(await begin())).get("error"), "email_not_supported");
  claimsFor(user, { hd: "school.example" });
  assert.ok((await callback(await begin())).get("code"));
  claimsFor(user, { hd: "school.example", sub: "different-google-account" });
  assert.equal((await callback(await begin())).get("error"), "account_mismatch");
});

test("legacy accounts without sessionVersion can link and return for subsequent Google sign-in", async () => {
  const user = await account();
  await User.collection.updateOne({ _id: user._id }, { $unset: { sessionVersion: "" } });
  for (let i = 0; i < 2; i++) {
    const { flow, code } = await loginGoogle(user);
    const response = await exchange(flow, code);
    assert.equal(response.status, 200);
    const payload = jwt.verify((await response.json()).token, process.env.JWT_SECRET);
    assert.equal(payload.exp - payload.iat, 28800);
  }
});

test("staff and admin password sign-in remains available; forged and expired JWTs are rejected", async () => {
  for (const role of ["student", "staff", "admin"]) {
    const user = await account({ role });
    const response = await request("/api/auth/login", { body: { email: user.email, password } });
    assert.equal(response.status, 200);
    const { token } = await response.json();
    assert.equal(jwt.verify(token, process.env.JWT_SECRET).authMethod, "password");
    assert.equal((await request(`/check/${role}`, { token })).status, 200);
    const expired = jwt.sign({ id: String(user._id) }, process.env.JWT_SECRET, { expiresIn: -1 });
    assert.equal((await request(`/check/${role}`, { token: expired })).status, 401);
    assert.equal((await request(`/check/${role}`, { token: "forged" })).status, 401);
  }
});

test("admin email edits unlink Google identity and revoke the previous session", async () => {
  const admin = await account({ role: "admin" });
  const user = await account();
  const { flow, code } = await loginGoogle(user);
  const { token } = await (await exchange(flow, code)).json();
  const current = await User.findById(user._id);
  const response = await request(`/api/admin/users/${user._id}`, { method: "PUT", token: issueSession(admin, false).token,
    body: { fullName: user.fullName, email: `${randomUUID()}@gmail.com`, role: "student", studentID: user.studentID, updatedAt: current.updatedAt.toISOString() } });
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal((await User.findById(user._id).select("+googleId")).googleId, undefined);
  assert.equal((await request("/check/student", { token })).status, 401);
});

test("missing Google configuration keeps password login available and reports a useful status", async () => {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_SECRET;
  try {
    const status = await request("/api/auth/google/status");
    assert.deepEqual(await status.json(), { enabled: false, clientOrigin: null });
    assert.equal((await request(`/api/auth/google?challenge=${random()}`)).status, 503);
    const user = await account();
    assert.equal((await request("/api/auth/login", { body: { email: user.email, password } })).status, 200);
  } finally { process.env.GOOGLE_CLIENT_SECRET = secret; }
});
