const attempts = new Map();
const WINDOW = 15 * 60 * 1000;

// Use a shared store when deploying multiple API workers.
module.exports = function recoveryLimiter(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts)
    if (value.until <= now) attempts.delete(key);
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, until: now + WINDOW };
  if (entry.count >= 10 || (!attempts.has(key) && attempts.size >= 10000)) {
    res.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((entry.until - now) / 1000))),
    );
    return res
      .status(429)
      .json({ message: "Too many requests. Please try again in 15 minutes." });
  }
  entry.count++;
  attempts.set(key, entry);
  next();
};
