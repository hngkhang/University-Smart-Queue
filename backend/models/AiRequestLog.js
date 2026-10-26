const mongoose = require("mongoose");
const { Schema } = mongoose;
const usageSchema = new Schema({
  inputTokens: Number, outputTokens: Number, thinkingTokens: Number, cachedTokens: Number, totalTokens: Number,
  source: { type: String, enum: ["provider", "estimated_chars", "unknown", "incomplete"] },
}, { _id: false });
const callSchema = new Schema({
  callId: String, kind: String, model: String, startedAt: Date, latencyMs: Number,
  status: String, errorCode: String, httpStatus: Number, usage: usageSchema,
  costUsd: { type: Number, default: null }, billingEstimateUsd: { type: Number, default: null },
  price: { type: new Schema({ input: Number, output: Number, cached: Number, version: String, source: String, checkedAt: String }, { _id: false }), default: null },
}, { _id: false });
const schema = new Schema({
  requestId: { type: String, required: true, unique: true },
  startedAt: { type: Date, required: true }, endedAt: Date, latencyMs: Number,
  feature: { type: String, enum: ["rag_chat", "booking_draft", "knowledge_ingest"], required: true },
  transport: { type: String, enum: ["http", "stream", "cli"] },
  status: { type: String, enum: ["success", "needs_input", "refused", "failed", "rejected", "cancelled"], required: true },
  reasonCode: String, promptVersion: String, toolsCalled: [String], providerCalls: [callSchema],
  models: [String], billingTier: String,
  inputTokens: Number, outputTokens: Number, thinkingTokens: Number,
  knownCostUsd: Number, costUsd: { type: Number, default: null },
  billingEstimateUsd: { type: Number, default: null },
  costStatus: { type: String, enum: ["measured", "estimated", "incomplete", "no_calls"] },
}, { versionKey: false, bufferCommands: false });
schema.index({ startedAt: -1, _id: -1 });
schema.index({ feature: 1, startedAt: -1 });
schema.index({ status: 1, startedAt: -1 });
schema.index({ models: 1, startedAt: -1 });
module.exports = mongoose.model("AiRequestLog", schema);
