const express = require("express");
const requireRole = require("../middleware/requireRole");
const { getStatus, answerQuestion } = require("../ai/service");
const { AiError } = require("../ai/errors");
const studentAuth = require("../middleware/studentAuth");
const booking = require("../ai/booking/service");

const router = express.Router();
router.get("/booking-status", (_req, res) => {
  res.set("Cache-Control", "no-store").json(booking.getBookingStatus());
});
router.post("/booking-draft", studentAuth, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try { res.json(await booking.createBookingDraft(req.body, req.student)); }
  catch (error) {
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
    res.set("Cache-Control", "no-store").json(await answerQuestion(req.body, req.user));
  } catch (error) {
    if (error instanceof AiError) return res.status(error.status).json({ code: error.code, message: error.message });
    next(error);
  }
});

module.exports = router;
