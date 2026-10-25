const mongoose = require("mongoose");

// TTL cleanup is asynchronous, so every read also checks expiresAt.
const schema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  kind: { type: String, enum: ["state", "exchange"], required: true },
  browserHash: String,
  challenge: { type: String, required: true },
  verifier: String,
  nonce: String,
  rememberMe: { type: Boolean, default: false },
  userId: mongoose.Schema.Types.ObjectId,
  sessionVersion: Number,
  expiresAt: { type: Date, required: true, expires: 0 },
}, { collection: "oauth_transactions" });

module.exports = mongoose.model("OAuthTransaction", schema);
