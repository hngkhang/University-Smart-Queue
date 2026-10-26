const express = require("express");
const AiRequestLog = require("../models/AiRequestLog");
const { parseQuery, metricsGroup, emptyMetrics, DAY } = require("../ai/usage/queries");
const { loggingHealth } = require("../ai/usage/recorder");
const { PRICES, VERSION } = require("../ai/usage/pricing");
const router = express.Router();
// Defense in depth if this router is mounted elsewhere in the future.
router.use(require("../middleware/requireRole")("admin"));
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const route = handler => async (req, res, next) => {
  try { await handler(req, res); }
  catch (error) { if (error.status === 400) return res.status(400).json({ message: error.message }); next(error); }
};
router.get("/summary", route(async (req, res) => {
  const { match, from, to, scope } = parseQuery(req.query);
  const [result] = await AiRequestLog.aggregate([{ $match: match }, { $facet: {
    totals: [{ $group: metricsGroup() }],
    features: [{ $group: metricsGroup("$feature") }, { $sort: { _id: 1 } }],
  } }]).option({ maxTimeMS: 5000 });
  const models = await AiRequestLog.distinct("models", { startedAt: match.startedAt }).maxTimeMS(5000);
  res.json({ from, to, scope, timezone: "Asia/Ho_Chi_Minh", totals: result.totals[0] || emptyMetrics(),
    features: result.features, models: [...new Set([...Object.keys(PRICES), ...models])].sort(),
    logging: loggingHealth(), pricingVersion: VERSION, generatedAt: new Date().toISOString() });
}));
router.get("/timeseries", route(async (req, res) => {
  const { match, from, to } = parseQuery(req.query);
  const rows = await AiRequestLog.aggregate([{ $match: match }, { $group: metricsGroup({ $dateToString: {
    format: "%Y-%m-%d", date: "$startedAt", timezone: "Asia/Ho_Chi_Minh",
  } }) }, { $sort: { _id: 1 } }]).option({ maxTimeMS: 5000 });
  const byDate = new Map(rows.map(row => [row._id, row]));
  const days = [];
  for (let date = +new Date(`${from}T00:00:00Z`); date <= +new Date(`${to}T00:00:00Z`); date += DAY) {
    const key = new Date(date).toISOString().slice(0, 10);
    days.push({ ...emptyMetrics(), ...byDate.get(key), date: key });
  }
  res.json({ days });
}));
router.get("/logs", route(async (req, res) => {
  const { match, page, pageSize, sort } = parseQuery(req.query);
  const [items, total] = await Promise.all([
    AiRequestLog.find(match).select("-providerCalls -toolsCalled -__v").sort(sort).skip((page - 1) * pageSize).limit(pageSize).maxTimeMS(5000).lean(),
    AiRequestLog.countDocuments(match).maxTimeMS(5000),
  ]);
  res.json({ items, total, page, pageSize });
}));
router.get("/logs/:requestId", route(async (req, res) => {
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(req.params.requestId)) return res.status(400).json({ message: "Request ID không hợp lệ." });
  const item = await AiRequestLog.findOne({ requestId: req.params.requestId }).maxTimeMS(5000).lean();
  if (!item) return res.status(404).json({ message: "Không tìm thấy yêu cầu AI." });
  res.json(item);
}));
module.exports = router;
