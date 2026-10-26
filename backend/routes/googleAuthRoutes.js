const express = require("express");
const mongoose = require("mongoose");
const { randomBytes } = require("node:crypto");
const OAuthTransaction = require("../models/OAuthTransaction");
const User = require("../models/User");
const google = require("../lib/googleOAuth");
const { issueSession } = require("../lib/authSession");
const router = express.Router();
const COOKIE = "smartqueue_google_state";
const random = () => randomBytes(32).toString("base64url");
const validToken = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const cookieOptions = (config) => ({ httpOnly: true, sameSite: "lax", secure: config.secure, path: "/api/auth/google" });

router.use((_req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  next();
});
router.get("/status", (_req, res) => {
  const config = google.getConfig();
  res.json({ enabled: Boolean(config), clientOrigin: config?.clientOrigin || null });
});
router.use((req, res, next) => {
  req.googleConfig = google.getConfig();
  if (!req.googleConfig) return res.status(503).json({ message: "Google student sign-in is not configured. Please sign in with your password." });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ message: "Database is not connected." });
  next();
});

router.get("/", async (req, res, next) => {
  if (!validToken(req.query.challenge)) return res.status(400).json({ message: "Start Google sign-in from the login page." });
  const config = req.googleConfig;
  const state = random(), browser = random(), verifier = random(), nonce = random();
  try {
    await OAuthTransaction.create({ kind: "state", tokenHash: google.hash(state), browserHash: google.hash(browser),
      challenge: req.query.challenge, verifier, nonce, rememberMe: req.query.rememberMe === "true",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
    res.cookie(COOKIE, browser, { ...cookieOptions(config), maxAge: 10 * 60 * 1000 });
    res.redirect(google.createClient(config).generateAuthUrl({
      scope: ["openid", "email", "profile"], state, nonce, prompt: "select_account",
      code_challenge: google.hash(verifier), code_challenge_method: "S256",
    }));
  } catch (error) { next(error); }
});

router.get("/callback", async (req, res) => {
  const config = req.googleConfig;
  const destination = new URL("/auth/google/callback", config.clientOrigin);
  const fail = (code) => { destination.hash = new URLSearchParams({ error: code }).toString(); return res.redirect(destination.href); };
  const browser = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  res.clearCookie(COOKIE, cookieOptions(config));
  if (!validToken(req.query.state) || !validToken(browser)) return fail("invalid_state");
  try {
    const transaction = await OAuthTransaction.findOneAndDelete({ kind: "state", tokenHash: google.hash(req.query.state),
      browserHash: google.hash(browser), expiresAt: { $gt: new Date() } }).lean();
    if (!transaction) return fail("invalid_state");
    if (req.query.error) return fail(req.query.error === "access_denied" ? "access_denied" : "google_failed");
    if (typeof req.query.code !== "string" || !req.query.code || req.query.code.length > 4096) return fail("google_failed");
    const claims = await google.verifyCode(config, req.query.code, transaction);
    const user = await google.resolveStudent(claims);
    const code = random();
    await OAuthTransaction.create({ kind: "exchange", tokenHash: google.hash(code), challenge: transaction.challenge,
      userId: user._id, sessionVersion: user.sessionVersion || 0, rememberMe: transaction.rememberMe,
      expiresAt: new Date(Date.now() + 60 * 1000) });
    // No Google tokens or application JWTs enter redirect URLs.
    destination.hash = new URLSearchParams({ code }).toString();
    return res.redirect(destination.href);
  } catch (error) {
    // Provider exceptions may contain credentials; never log their request/response objects.
    return fail(error.authCode || "google_failed");
  }
});

router.post("/exchange", async (req, res, next) => {
  const { code, verifier } = req.body || {};
  if (!validToken(code) || !validToken(verifier)) return res.status(400).json({ message: "Invalid Google sign-in request. Please try again." });
  try {
    const transaction = await OAuthTransaction.findOneAndDelete({ kind: "exchange", tokenHash: google.hash(code),
      challenge: google.hash(verifier), expiresAt: { $gt: new Date() } }).lean();
    if (!transaction) return res.status(401).json({ message: "Google sign-in has expired or was already used. Please try again." });
    const user = await User.findById(transaction.userId).select("+sessionVersion").lean();
    if (!user || user.isActive === false || user.role !== "student") return res.status(403).json({ message: "Google sign-in is available only to active student accounts." });
    if ((user.sessionVersion || 0) !== transaction.sessionVersion) return res.status(401).json({ message: "Your account has changed. Please sign in again." });
    return res.json({ ...issueSession(user, transaction.rememberMe, "google"), rememberMe: transaction.rememberMe });
  } catch (error) { next(error); }
});

module.exports = router;
