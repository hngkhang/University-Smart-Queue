const express = require("express");
const knowledge = require("../ai/knowledgeUpload");
const usage = require("../ai/usage/recorder");

const router = express.Router();
// Mounted after the admin authentication middleware in adminRoutes.
router.get("/", async (_req, res, next) => {
  try { res.json(await knowledge.status()); }
  catch (error) { next(error); }
});
router.put("/", (req, res, next) => {
  if (!req.is("application/octet-stream")) return res.status(415).json({ message: "Vui lòng chọn một file .md để tải lên." });
  next();
}, express.raw({ type: "application/octet-stream", limit: knowledge.MAX_BYTES, inflate: false }), async (req, res, next) => {
  let filename;
  try { filename = decodeURIComponent(req.get("X-File-Name") || ""); }
  catch { return res.status(400).json({ message: "Tên file không hợp lệ." }); }
  try { res.json(await usage.trackWork(() => knowledge.replace(filename, req.body))); }
  catch (error) {
    if (error.publicMessage) return res.status(error.status).json({ message: error.publicMessage });
    next(error);
  }
});
router.use((error, _req, res, next) => {
  if (error.type === "entity.too.large") return res.status(413).json({ message: "File vượt quá giới hạn 2 MB." });
  if (error.status === 415) return res.status(415).json({ message: "Không hỗ trợ file nén. Vui lòng tải trực tiếp file .md." });
  next(error);
});
module.exports = router;
