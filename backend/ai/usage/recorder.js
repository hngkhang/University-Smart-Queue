const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const AiRequestLog = require("../../models/AiRequestLog");
const { normalizeUsage, priceCall } = require("./pricing");
const context = new AsyncLocalStorage();
const pending = new Set();
const health = { since: new Date().toISOString(), failedWrites: 0, lastFailureAt: null };
const safeCode = value => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : "AI_INTERNAL_ERROR";

function createRecord(feature, transport = "http") {
  return { requestId: randomUUID(), feature, transport, startedAt: new Date(), promptVersion: "not_applicable",
    toolsCalled: [], providerCalls: [], billingTier: ["free", "paid"].includes(process.env.AI_BILLING_TIER) ? process.env.AI_BILLING_TIER : "unconfigured" };
}
function setOutcome(status, reasonCode) {
  const record = context.getStore();
  if (record && record.status !== "cancelled") { record.status = status; record.reasonCode = reasonCode; }
}
function recordError(error) {
  const code = safeCode(error?.code);
  setOutcome(code === "AI_SAFETY_REFUSAL" ? "refused" : ["AI_INVALID_INPUT", "AI_AUTH_REQUIRED", "AI_RATE_LIMIT"].includes(code) ? "rejected" : "failed", code);
}
function setPrompt(version) { const record = context.getStore(); if (record) record.promptVersion = version; }
function requestId() { return context.getStore()?.requestId; }
function maybeFinish(record) {
  if (record?._finish && !record._holds && record.providerCalls.every(call => call.status !== "pending")) record._finish();
}
// A disconnected upload can keep indexing. Do not persist before its last batch.
function hold() {
  const record = context.getStore();
  if (!record) return () => {};
  record._holds = (record._holds || 0) + 1;
  let released = false;
  return () => { if (!released) { released = true; record._holds--; maybeFinish(record); } };
}
async function trackWork(callback) {
  const release = hold();
  try { return await callback(); }
  finally { release(); }
}

function beginCall(kind, model) {
  const record = context.getStore();
  const started = performance.now();
  const call = { callId: randomUUID(), kind, model, startedAt: new Date(), status: "pending",
    usage: normalizeUsage({}, { complete: false }) };
  if (record) record.providerCalls.push(call);
  let finished = false;
  return {
    usage(raw, options) { call.usage = normalizeUsage(raw, options); },
    finish(error, httpStatus) {
      if (finished) return;
      finished = true;
      call.latencyMs = Math.round(performance.now() - started);
      call.status = error ? "failed" : "success";
      if (error) call.errorCode = safeCode(error.code || (error.name === "AbortError" ? "AI_CANCELLED" : error.name === "TimeoutError" ? "AI_TIMEOUT" : "AI_PROVIDER_ERROR"));
      if (httpStatus) call.httpStatus = httpStatus;
      Object.assign(call, priceCall(model, call.usage, record?.billingTier));
      maybeFinish(record);
    },
  };
}

function summarize(record) {
  const calls = record.providerCalls;
  const complete = calls.every(call => call.costUsd !== null && call.costUsd !== undefined);
  const knownCostUsd = calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0);
  const { _finish, _holds, ...data } = record;
  const tokenTotal = field => calls.every(call => call.usage[field] != null) ? calls.reduce((sum, call) => sum + call.usage[field], 0) : null;
  return { ...data, models: [...new Set(calls.map(call => call.model))], knownCostUsd,
    inputTokens: tokenTotal("inputTokens"), outputTokens: tokenTotal("outputTokens"), thinkingTokens: tokenTotal("thinkingTokens"),
    costUsd: complete ? knownCostUsd : null,
    costStatus: !calls.length ? "no_calls" : !complete ? "incomplete" : calls.some(call => call.usage.source === "estimated_chars") ? "estimated" : "measured",
    billingEstimateUsd: !calls.length || record.billingTier === "free" ? 0 : record.billingTier === "paid" && complete ? knownCostUsd : null };
}
async function persist(record) {
  const data = summarize(record);
  try {
    if (mongoose.connection.readyState !== 1) throw new Error("Logging database unavailable");
    await AiRequestLog.updateOne({ requestId: data.requestId }, { $set: data }, { upsert: true, maxTimeMS: 3000 });
  } catch {
    health.failedWrites++;
    health.lastFailureAt = new Date().toISOString();
    // Metadata only: never print an upstream exception, body, API key, user or document.
    console.error(JSON.stringify({ event: "ai_log_write_failed", requestId: data.requestId, feature: data.feature }));
  }
}
function finish(record, fallbackStatus = "success", reasonCode) {
  if (record._finish) return;
  record.endedAt = new Date();
  record.latencyMs = record.endedAt - record.startedAt;
  if (!record.status) { record.status = fallbackStatus; record.reasonCode = reasonCode; }
  let resolve;
  const task = new Promise(done => { resolve = done; });
  pending.add(task);
  let saved = false;
  record._finish = () => {
    if (saved) return;
    saved = true;
    void persist(record).finally(() => { pending.delete(task); resolve(); });
  };
  maybeFinish(record);
  return task;
}
function middleware(feature, transport = "http") {
  return (_req, res, next) => {
    if (context.getStore()) return next();
    const record = createRecord(feature, transport);
    res.set("X-AI-Request-ID", record.requestId);
    res.once("finish", () => {
      const status = res.statusCode >= 500 ? "failed" : res.statusCode >= 400 ? "rejected" : "success";
      void finish(record, status, status === "success" ? undefined : `HTTP_${res.statusCode}`);
    });
    res.once("close", () => {
      if (!res.writableFinished) { record.status = "cancelled"; record.reasonCode = "CLIENT_DISCONNECTED"; void finish(record); }
    });
    context.run(record, next);
  };
}
function aiMiddleware(req, res, next) {
  if (req.method !== "POST") return next();
  const path = req.path.replace(/\/$/, "");
  if (path === "/booking-draft") return middleware("booking_draft")(req, res, next);
  if (["/chat", "/chat/stream"].includes(path)) return middleware("rag_chat", path.endsWith("/stream") ? "stream" : "http")(req, res, next);
  next();
}
async function operation(feature, callback, { transport = "cli" } = {}) {
  if (context.getStore()) return callback();
  const record = createRecord(feature, transport);
  return context.run(record, async () => {
    try { return await callback(); }
    catch (error) { recordError(error); throw error; }
    finally { await finish(record); }
  });
}
async function flush() { await Promise.all([...pending]); }
module.exports = { middleware, aiMiddleware, operation, hold, trackWork, beginCall, setOutcome, setPrompt, recordError, requestId,
  summarize, createRecord, flush, loggingHealth: () => ({ ...health, pendingWrites: pending.size }) };
