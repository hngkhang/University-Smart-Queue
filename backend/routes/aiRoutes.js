const express = require("express");
const requireRole = require("../middleware/requireRole");
const { getStatus, answerQuestion, streamQuestion } = require("../ai/service");
const { AiError } = require("../ai/errors");
const studentAuth = require("../middleware/studentAuth");
const booking = require("../ai/booking/service");
const usage = require("../ai/usage/recorder");

const router = express.Router();
// Run before authorization so rejected AI requests are visible as well.
router.use(usage.aiMiddleware);
router.get("/booking-status", (_req, res) => {
  res.set("Cache-Control", "no-store").json(booking.getBookingStatus());
});
router.post("/booking-draft", studentAuth, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { res.json(await usage.trackWork(() => booking.createBookingDraft(req.body, req.student))); }
  catch (error) {
    usage.recordError(error);
    if (error instanceof AiError) return res.status(error.status).json({ code: error.code, message: error.message });
    next(error);
  }
});
// Public readiness response contains no credentials, paths or private document data.
router.get("/status", async (_req, res, next) => {
  try { res.set("Cache-Control", "no-store").json(await getStatus()); }
  catch (error) { next(error); }
});
router.post("/chat", requireRole(), async (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store").json(await usage.trackWork(() => answerQuestion(req.body, req.user)));
  } catch (error) {
    usage.recordError(error);
    if (error instanceof AiError) return res.status(error.status).json({ code: error.code, message: error.message });
    next(error);
  }
});

router.post("/chat/stream", requireRole(), async (req, res, next) => {
  const release = usage.hold();
  const controller = new AbortController();
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });
  try {
    for await (const event of streamQuestion(req.body, req.user, { signal: controller.signal })) {
      if (controller.signal.aborted) return;
      if (!res.headersSent) {
        res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
        res.flushHeaders();
      }
      res.write(`${JSON.stringify(event)}\n`);
    }
    if (!res.headersSent) {
      res.set({ "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    }
    if (!controller.signal.aborted) res.end();
  } catch (error) {
    usage.recordError(error);
    if (controller.signal.aborted) return;
    if (!res.headersSent) {
      if (error instanceof AiError) return res.status(error.status).json({ code: error.code, message: error.message });
      return next(error);
    }
    const safeError = error instanceof AiError ? error : new AiError("AI_UNAVAILABLE", "Trợ lý tạm thời gặp lỗi. Vui lòng thử lại sau.");
    res.end(`${JSON.stringify({ type: "error", code: safeError.code, message: safeError.message })}\n`);
  } finally {
    release();
  }
});

module.exports = router;
