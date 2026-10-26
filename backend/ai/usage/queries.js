const FEATURES = ["rag_chat", "booking_draft", "knowledge_ingest"];
const STATUSES = ["success", "needs_input", "refused", "failed", "rejected", "cancelled"];
const DAY = 86400000;
function bad(message) { return Object.assign(new Error(message), { status: 400 }); }
function day(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad("Ngày phải có định dạng YYYY-MM-DD.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw bad("Ngày không hợp lệ.");
  return parsed;
}
function parseQuery(query, now = new Date()) {
  const today = new Date(+now + 7 * 3600000).toISOString().slice(0, 10);
  const to = query.to === undefined ? today : query.to;
  const from = query.from === undefined ? new Date(+day(to) - 6 * DAY).toISOString().slice(0, 10) : query.from;
  const start = day(from), end = day(to);
  if (start > end || end - start >= 366 * DAY) throw bad("Chọn khoảng ngày hợp lệ, tối đa 366 ngày.");
  const scope = query.scope ?? "interactive";
  if (!["interactive", "ingest", "all"].includes(scope)) throw bad("Phạm vi không hợp lệ.");
  const match = { startedAt: { $gte: new Date(+start - 7 * 3600000), $lt: new Date(+end + DAY - 7 * 3600000) } };
  if (scope === "interactive") match.feature = { $in: ["rag_chat", "booking_draft"] };
  if (scope === "ingest") match.feature = "knowledge_ingest";
  if (query.feature) {
    if (!FEATURES.includes(query.feature) || (scope === "interactive" && query.feature === "knowledge_ingest") || (scope === "ingest" && query.feature !== "knowledge_ingest")) throw bad("Tính năng không thuộc phạm vi đã chọn.");
    match.feature = query.feature;
  }
  if (query.status) { if (!STATUSES.includes(query.status)) throw bad("Trạng thái không hợp lệ."); match.status = query.status; }
  if (query.model) {
    if (typeof query.model !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(query.model)) throw bad("Model không hợp lệ.");
    match.models = query.model;
  }
  if (query.requestId) {
    if (typeof query.requestId !== "string" || !/^[a-f\d-]{1,36}$/i.test(query.requestId)) throw bad("Request ID chỉ chứa ký tự hex và dấu gạch ngang.");
    match.requestId = { $regex: `^${query.requestId}`, $options: "i" };
  }
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw bad("Phân trang không hợp lệ.");
    return Number(value);
  };
  const sort = query.sort || "newest";
  const sorts = { newest: { startedAt: -1, _id: -1 }, oldest: { startedAt: 1, _id: 1 }, cost: { knownCostUsd: -1, _id: -1 }, latency: { latencyMs: -1, _id: -1 } };
  if (!Object.hasOwn(sorts, sort)) throw bad("Thứ tự sắp xếp không hợp lệ.");
  return { match, from, to, scope, page: integer(query.page, 1, 10000), pageSize: integer(query.pageSize, 12, 50), sort: sorts[sort] };
}
function metricsGroup(id = null) {
  const group = { _id: id, requests: { $sum: 1 }, providerCalls: { $sum: { $size: "$providerCalls" } },
    knownCostUsd: { $sum: "$knownCostUsd" }, completeCostUsd: { $sum: { $ifNull: ["$costUsd", 0] } },
    pricedRequests: { $sum: { $cond: [{ $ne: ["$costUsd", null] }, 1, 0] } },
    estimatedRequests: { $sum: { $cond: [{ $eq: ["$costStatus", "estimated"] }, 1, 0] } },
    billingKnownRequests: { $sum: { $cond: [{ $ne: ["$billingEstimateUsd", null] }, 1, 0] } },
    billingEstimateUsd: { $sum: { $ifNull: ["$billingEstimateUsd", 0] } },
    avgLatencyMs: { $avg: "$latencyMs" },
    avgCostUsd: { $avg: "$costUsd" },
    inputTokens: { $sum: { $sum: "$providerCalls.usage.inputTokens" } },
    outputTokens: { $sum: { $sum: "$providerCalls.usage.outputTokens" } },
    thinkingTokens: { $sum: { $sum: "$providerCalls.usage.thinkingTokens" } } };
  for (const status of STATUSES) group[status] = { $sum: { $cond: [{ $eq: ["$status", status] }, 1, 0] } };
  return group;
}
function emptyMetrics() {
  return Object.fromEntries(Object.keys(metricsGroup()).filter(key => key !== "_id").map(key => [key, key.startsWith("avg") ? null : 0]));
}
module.exports = { parseQuery, metricsGroup, emptyMetrics, DAY };
