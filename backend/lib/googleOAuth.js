const { OAuth2Client } = require("google-auth-library");
const { createHash } = require("node:crypto");
const User = require("../models/User");

const hash = (value) => createHash("sha256").update(value).digest("base64url");
const fail = (code) => Object.assign(new Error(code), { authCode: code });

function getConfig() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, CLIENT_URL, JWT_SECRET } = process.env;
  if (![GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, CLIENT_URL, JWT_SECRET].every((v) => v?.trim())) return null;
  try {
    const client = new URL(CLIENT_URL);
    const callback = new URL(GOOGLE_CALLBACK_URL);
    for (const url of [client, callback]) {
      if (url.username || url.password || url.search || url.hash) return null;
      if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    }
    if (client.pathname !== "/" || callback.pathname !== "/api/auth/google/callback") return null;
    return { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET,
      callbackUrl: callback.href, clientOrigin: client.origin, secure: callback.protocol === "https:" };
  } catch { return null; }
}

function createClient(config) {
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
    redirectUri: config.callbackUrl, transporterOptions: { timeout: 10000 } });
}

async function verifyCode(config, code, transaction) {
  const client = createClient(config);
  const { tokens } = await client.getToken({ code, codeVerifier: transaction.verifier });
  if (!tokens.id_token) throw fail("google_failed");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
  const claims = ticket.getPayload();
  if (!claims || claims.nonce !== transaction.nonce || claims.email_verified !== true ||
      typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string") throw fail("google_failed");
  return claims;
}

async function resolveStudent(claims) {
  if (claims.email_verified !== true || typeof claims.sub !== "string" || !claims.sub ||
      typeof claims.email !== "string" || !claims.email.trim()) throw fail("google_failed");
  const email = claims.email.trim().toLowerCase();
  const fields = "+googleId +sessionVersion";
  let user = await User.findOne({ googleId: claims.sub }).select(fields).lean();
  if (!user) user = await User.findOne({ email }).select(fields).lean();
  if (!user) {
    try {
      // Only verified Google identity fields are copied. The server fixes the role.
      user = (await User.create({
        email, googleId: claims.sub,
        fullName: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 120) : email.split("@")[0],
        role: "student", isActive: true,
      })).toObject();
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Concurrent first sign-ins can race on either unique identity index.
      user = await User.findOne({ googleId: claims.sub }).select(fields).lean() ||
        await User.findOne({ email }).select(fields).lean();
      if (!user) throw fail("account_mismatch");
    }
  }
  if (user.email !== email || (user.googleId && user.googleId !== claims.sub)) throw fail("account_mismatch");
  if (user.role !== "student") throw fail("role_conflict");
  if (user.isActive === false) throw fail("account_disabled");
  if (!user.googleId) {
    // Linking an existing account needs current email ownership, not just an old verification.
    if (!email.endsWith("@gmail.com") && !claims.hd) throw fail("email_not_supported");
    user = await User.findOneAndUpdate({ _id: user._id, email, role: "student", isActive: { $ne: false },
      sessionVersion: user.sessionVersion ? user.sessionVersion : { $in: [0, null] }, googleId: { $exists: false } },
    { $set: { googleId: claims.sub } }, { returnDocument: "after", runValidators: true }).select(fields).lean();
    // A concurrent callback may already have linked the same subject.
    if (!user) user = await User.findOne({ googleId: claims.sub, email, role: "student", isActive: { $ne: false } }).select(fields).lean();
    if (!user) throw fail("account_mismatch");
  }
  return user;
}

module.exports = { hash, getConfig, createClient, verifyCode, resolveStudent };
