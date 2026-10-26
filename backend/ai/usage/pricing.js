// USD per million tokens, standard synchronous Developer API (not Batch API).
// Keep snapshots on each call: historical costs must not change with this table.
const VERSION = "2026-10-26-v1";
const PRICES = {
  "gemini-3.5-flash-lite": { input: 0.30, output: 2.50, cached: 0.03,
    source: "https://ai.google.dev/gemini-api/docs/pricing", checkedAt: "2026-10-26" },
  "gemini-embedding-001": { input: 0.15, output: 0, cached: 0,
    source: "https://developers.googleblog.com/en/gemini-embedding-available-gemini-api/", checkedAt: "2026-10-26" },
};
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

function normalizeUsage(raw = {}, { embedding = false, estimatedInput = null, complete = true } = {}) {
  if (!raw || typeof raw !== "object") raw = {};
  const inputTokens = count(raw.promptTokenCount) ?? (embedding ? count(raw.totalTokenCount) : null);
  const outputTokens = embedding ? 0 : count(raw.candidatesTokenCount);
  const thinkingTokens = count(raw.thoughtsTokenCount) ?? 0;
  const cachedTokens = count(raw.cachedContentTokenCount) ?? 0;
  // Missing embedding usage is a visibly labelled heuristic, never a measured count.
  const estimated = embedding && inputTokens === null && count(estimatedInput) !== null;
  return { inputTokens: estimated ? estimatedInput : inputTokens, outputTokens, thinkingTokens, cachedTokens,
    totalTokens: count(raw.totalTokenCount),
    source: !complete ? "incomplete" : estimated ? "estimated_chars" : inputTokens !== null && outputTokens !== null ? "provider" : "unknown" };
}

function priceCall(model, usage, billingTier = "unconfigured") {
  const rates = PRICES[model.replace(/^models\//, "")];
  const known = rates && ["provider", "estimated_chars"].includes(usage.source) &&
    usage.inputTokens !== null && usage.outputTokens !== null && usage.cachedTokens <= usage.inputTokens;
  const costUsd = known ? ((usage.inputTokens - usage.cachedTokens) * rates.input + usage.cachedTokens * rates.cached +
    (usage.outputTokens + usage.thinkingTokens) * rates.output) / 1e6 : null;
  return { costUsd, billingEstimateUsd: billingTier === "free" ? 0 : billingTier === "paid" ? costUsd : null,
    price: rates ? { ...rates, version: VERSION } : null };
}

module.exports = { VERSION, PRICES, normalizeUsage, priceCall };
