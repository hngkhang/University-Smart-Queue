const express = require("express");
const requireRole = require("../middleware/requireRole");
const { getStatus, answerQuestion } = require("../ai/service");
const { AiError } = require("../ai/errors");

const router = express.Router();
// Public readiness response contains no credentials, paths or private document data.
router.get("/status", async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(await getStatus()); }
  catch (error) { next(error); }
});
router.post("/chat", requireRole(), async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(await answerQuestion(req.body, req.user));
  } catch (error) {
    if (error instanceof AiError) return res.status(error.status).json({ code: error.code, message: error.message });
    next(error);
  }
});

module.exports = router;
