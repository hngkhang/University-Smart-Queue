const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const google = require("../lib/googleOAuth");
const { issueSession } = require("../lib/authSession");

afterEach(() => mock.restoreAll());
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config = { clientId: "test.apps.googleusercontent.com", clientSecret: "test-secret", callbackUrl: "http://127.0.0.1:5000/api/auth/google/callback" };
const claims = { iss: "https://accounts.google.com", aud: config.clientId, sub: "student-google-id", email: "student@gmail.com", email_verified: true, nonce: "expected-nonce" };

function provider(overrides = {}, signingKey = privateKey) {
  const id_token = jwt.sign({ ...claims, ...overrides }, signingKey, { algorithm: "RS256", keyid: "test-key", ...(overrides.exp ? {} : { expiresIn: "5m" }) });
  mock.method(OAuth2Client.prototype, "getToken", async (input) => {
    assert.deepEqual(input, { code: "google-code", codeVerifier: "server-verifier" });
    return { tokens: { id_token } };
  });
  mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => ({ certs: { "test-key": publicKey.export({ type: "spki", format: "pem" }) } }));
}
const verify = () => google.verifyCode(config, "google-code", { verifier: "server-verifier", nonce: claims.nonce });

test("Google library verifies signed ID tokens; exchange supplies the server PKCE verifier", async () => {
  provider();
  assert.equal((await verify()).sub, claims.sub);
});
for (const [name, overrides] of [
  ["wrong audience", { aud: "another-client" }],
  ["wrong issuer", { iss: "https://attacker.test" }],
  ["expired token", { iat: Math.floor(Date.now() / 1000) - 1800, exp: Math.floor(Date.now() / 1000) - 900 }],
  ["wrong nonce", { nonce: "other-flow" }],
  ["unverified email", { email_verified: false }],
  ["missing subject", { sub: "" }],
]) test(`rejects ${name}`, async () => { provider(overrides); await assert.rejects(verify()); });

test("rejects a token signed by an unknown key", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  provider({}, other.privateKey);
  await assert.rejects(verify());
});

test("application JWTs contain safe identity, auth method and explicit lifetime", () => {
  process.env.JWT_SECRET = randomUUID();
  const user = { _id: "123456789012345678901234", email: claims.email, role: "student", sessionVersion: 4, password: "private", googleId: "private" };
  for (const [remember, seconds] of [[false, 28800], [true, 604800], ["true", 28800]]) {
    const result = issueSession(user, remember, "google");
    const payload = jwt.verify(result.token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(payload.exp - payload.iat, seconds);
    assert.equal(payload.authMethod, "google");
    assert.equal(payload.sessionVersion, 4);
    for (const field of ["password", "googleId", "sessionVersion"]) assert.equal(field in result.user, false);
  }
});

test("configuration rejects incomplete settings and insecure production URLs", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { GOOGLE_CLIENT_ID: config.clientId, GOOGLE_CLIENT_SECRET: config.clientSecret, GOOGLE_CALLBACK_URL: config.callbackUrl, CLIENT_URL: "http://localhost:5173", JWT_SECRET: "test", NODE_ENV: "test" });
    assert.equal(google.getConfig().clientOrigin, "http://localhost:5173");
    process.env.NODE_ENV = "production";
    assert.equal(google.getConfig(), null);
    process.env.GOOGLE_CALLBACK_URL = "https://api.example.test/api/auth/google/callback";
    process.env.CLIENT_URL = "https://queue.example.test";
    assert.equal(google.getConfig().secure, true);
    process.env.GOOGLE_CLIENT_SECRET = "";
    assert.equal(google.getConfig(), null);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
