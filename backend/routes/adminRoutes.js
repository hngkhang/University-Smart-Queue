const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
require("../models/Department");

const router = express.Router();
router.use(require("../middleware/requireRole")("admin"));
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const roles = { role: { $in: ["student", "staff"] } };
const search = (value) => {
  const term = typeof value === "string" ? value.trim().slice(0, 100) : "";
  if (!term) return {};
  const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    $or: ["fullName", "email", "studentID"].map((key) => ({
      [key]: { $regex: pattern, $options: "i" },
    })),
  };
};
const pageNumber = (value) =>
  Math.max(1, Math.min(100000, parseInt(value, 10) || 1));
const PAGE_SIZE = 12;
const requestProjection = {
  _id: "$passwordRequests._id",
  userId: "$_id",
  fullName: 1,
  email: 1,
  role: 1,
  studentID: 1,
  phone: 1,
  isActive: 1,
  department: { $ifNull: [{ $arrayElemAt: ["$departmentInfo.name", 0] }, ""] },
  note: "$passwordRequests.note",
  status: "$passwordRequests.status",
  createdAt: "$passwordRequests.createdAt",
  resolvedAt: "$passwordRequests.resolvedAt",
  resolvedByName: "$passwordRequests.resolvedByName",
  reason: "$passwordRequests.reason",
};
router.get("/summary", async (_req, res, next) => {
  try {
    const [students, staff, counts] = await Promise.all([
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "staff" }),
      User.aggregate([
        { $match: roles },
        { $unwind: "$passwordRequests" },
        { $group: { _id: "$passwordRequests.status", count: { $sum: 1 } } },
      ]),
    ]);
    const result = { students, staff, pending: 0, completed: 0, rejected: 0 };
    for (const row of counts) result[row._id] = row.count;
    res.json(result);
  } catch (error) {
    next(error);
  }
});
router.get("/users", async (req, res, next) => {
  try {
    const filter = {
      ...roles,
      ...search(req.query.search),
      ...(["student", "staff"].includes(req.query.role)
        ? { role: req.query.role }
        : {}),
    };
    const page = pageNumber(req.query.page);
    const [items, total] = await Promise.all([
      User.find(filter)
        .select(
          "fullName email role studentID phone department isActive createdAt",
        )
        .populate({ path: "department", model: "Department", select: "name" })
        .sort({ fullName: 1, _id: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
      User.countDocuments(filter),
    ]);
    res.json({ items, total, page, pageSize: PAGE_SIZE });
  } catch (error) {
    next(error);
  }
});
router.get("/requests", async (req, res, next) => {
  try {
    const page = pageNumber(req.query.page);
    const status = ["pending", "completed", "rejected"].includes(
      req.query.status,
    )
      ? req.query.status
      : null;
    const match = status
      ? { "passwordRequests.status": status }
      : req.query.activity === "true"
        ? { "passwordRequests.status": { $in: ["completed", "rejected"] } }
        : {};
    const [result] = await User.aggregate([
      { $match: { ...roles, ...search(req.query.search) } },
      { $unwind: "$passwordRequests" },
      { $match: match },
      {
        $facet: {
          items: [
            {
              $sort: {
                [req.query.activity === "true"
                  ? "passwordRequests.resolvedAt"
                  : "passwordRequests.createdAt"]: -1,
                "passwordRequests._id": -1,
              },
            },
            { $skip: (page - 1) * PAGE_SIZE },
            { $limit: PAGE_SIZE },
            {
              $lookup: {
                from: "departments",
                localField: "department",
                foreignField: "_id",
                as: "departmentInfo",
              },
            },
            { $project: requestProjection },
          ],
          total: [{ $count: "value" }],
        },
      },
    ]);
    res.json({
      items: result.items,
      total: result.total[0]?.value || 0,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    next(error);
  }
});
router.post("/requests/:id/resolve", async (req, res, next) => {
  const { action, password, confirmation, verified, reason } = req.body || {};
  if (!mongoose.isObjectIdOrHexString(req.params.id))
    return res.status(400).json({ message: "Invalid request ID." });
  if (!["reset", "reject"].includes(action))
    return res.status(400).json({ message: "Choose reset or reject." });
  if (
    action === "reset" &&
    (verified !== true ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      password !== confirmation)
  ) {
    return res
      .status(400)
      .json({
        message:
          "Verify identity and enter matching passwords (at least 8 characters, at most 72 UTF-8 bytes).",
      });
  }
  if (
    action === "reject" &&
    (typeof reason !== "string" || !reason.trim() || reason.length > 500)
  )
    return res
      .status(400)
      .json({ message: "Provide a rejection reason (1–500 characters)." });
  try {
    const update = {
      $set: {
        "passwordRequests.$.status":
          action === "reset" ? "completed" : "rejected",
        "passwordRequests.$.resolvedAt": new Date(),
        "passwordRequests.$.resolvedBy": req.user._id,
        "passwordRequests.$.resolvedByName": req.user.fullName,
        "passwordRequests.$.reason": action === "reject" ? reason.trim() : "",
      },
    };
    if (action === "reset") {
      update.$set.password = await bcrypt.hash(password, 12);
      update.$inc = { sessionVersion: 1 };
    }
    const result = await User.updateOne(
      {
        ...roles,
        ...(action === "reset" ? { isActive: { $ne: false } } : {}),
        passwordRequests: {
          $elemMatch: { _id: req.params.id, status: "pending" },
        },
      },
      update,
      { runValidators: true },
    );
    if (!result.modifiedCount)
      return res
        .status(409)
        .json({
          message:
            "This request has already been handled, is unavailable, or the account is disabled. Refresh the list.",
        });
    res.json({
      message:
        action === "reset"
          ? "Password reset. Previous sessions have been revoked. Hand the new password to the verified account owner in person."
          : "Request rejected. The password is unchanged.",
    });
  } catch (error) {
    next(error);
  }
});
module.exports = router;
