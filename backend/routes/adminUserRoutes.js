const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Department = require("../models/Department");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");

// Mounted behind the admin authentication middleware in adminRoutes.
const router = express.Router();
const managedRoles = { role: { $in: ["student", "staff"] } };
const fields = "fullName email role studentID phone department isActive createdAt updatedAt";
const present = async (query) => {
  const result = await query.select(fields)
    .populate({ path: "department", model: "Department", select: "name" }).lean();
  const normalize = (account) => account ? { ...account, updatedAt: account.updatedAt || null, isActive: account.isActive !== false } : null;
  return Array.isArray(result) ? result.map(normalize) : normalize(result);
};
const versionFilter = (stamp) => stamp === null ? null : new Date(stamp);
const text = (value, max) => typeof value === "string" && value.trim().length <= max ? value.trim() : null;
const conflict = (res) => res.status(409).json({ message: "This account has changed. Close this dialog, refresh the list and try again." });

function parseProfile(body) {
  const fullName = text(body?.fullName, 120);
  const email = text(body?.email, 254)?.toLowerCase();
  const phone = text(body?.phone ?? "", 32);
  const studentID = text(body?.studentID ?? "", 40);
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      phone === null || (phone && !/^[+\d\s().-]{6,32}$/.test(phone)) ||
      !["student", "staff"].includes(body?.role) || studentID === null ||
      (body.role === "student" && !studentID)) return null;
  if (body.role === "staff" && !mongoose.isObjectIdOrHexString(body.department)) return null;
  return { fullName, email, phone, role: body.role,
    studentID: body.role === "student" ? studentID : "",
    department: body.role === "staff" ? body.department : null };
}

async function departmentAvailable(input, current) {
  if (input.role !== "staff") return true;
  // Existing assignments to inactive offices may be retained; new assignments need an active office.
  const unchanged = current?.department?.toString() === input.department;
  return Boolean(await Department.exists({ _id: input.department, isArchived: { $ne: true },
    ...(!unchanged ? { isActive: true } : {}) }));
}

async function outstandingWork(current, input) {
  if (current.role === "staff" && (input.role !== "staff" || input.isActive === false ||
      String(current.department || "") !== String(input.department || ""))) {
    if (await Ticket.exists({ assignedStaff: current._id, status: { $in: ["called", "serving"] } }))
      return "Finish or cancel this staff member's current visit before changing their access or department.";
  }
  if (current.role === "student" && input.role !== "student") {
    const [ticket, appointment] = await Promise.all([
      Ticket.exists({ student: current._id, status: { $in: ["waiting", "called", "serving"] } }),
      Appointment.exists({ student: current._id, status: "confirmed", endsAt: { $gt: new Date() } }),
    ]);
    if (ticket || appointment) return "Resolve this student's active ticket and upcoming appointments before changing their role.";
  }
  return null;
}

function handleError(error, res, next) {
  if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
  next(error);
}

router.get("/", async (req, res, next) => {
  try {
    const term = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
    const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = { ...managedRoles,
      ...(["student", "staff"].includes(req.query.role) ? { role: req.query.role } : {}),
      ...(req.query.status === "active" ? { isActive: { $ne: false } } : req.query.status === "disabled" ? { isActive: false } : {}),
      ...(term ? { $or: ["fullName", "email", "studentID"].map((key) => ({ [key]: { $regex: pattern, $options: "i" } })) } : {}),
    };
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const pageSize = 12;
    const [items, total] = await Promise.all([
      present(User.find(filter).sort({ fullName: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize)),
      User.countDocuments(filter),
    ]);
    res.json({ items, total, page, pageSize });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = parseProfile(req.body);
    if (!input) return res.status(400).json({ message: "Enter a valid name, email, phone, role and student ID or staff department." });
    const { password, confirmation } = req.body;
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || password !== confirmation)
      return res.status(400).json({ message: "Enter matching passwords with at least 8 characters and at most 72 UTF-8 bytes." });
    if (!await departmentAvailable(input)) return res.status(400).json({ message: "Select an active, available department for this staff member." });
    const user = await User.create({ ...input, password: await bcrypt.hash(password, 12), isActive: true });
    res.status(201).json({ account: await present(User.findById(user._id)), message: "Account created." });
  } catch (error) { handleError(error, res, next); }
});

router.use("/:id", (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Invalid account ID." });
  const stamp = req.body?.updatedAt;
  // Imported legacy records may not have timestamps; explicit null matches only those records.
  if (stamp !== null && (typeof stamp !== "string" || !Number.isFinite(Date.parse(stamp))))
    return res.status(400).json({ message: "The account version is required. Refresh the list and try again." });
  next();
});

router.put("/:id", async (req, res, next) => {
  try {
    const input = parseProfile(req.body);
    if (!input) return res.status(400).json({ message: "Enter a valid name, email, phone, role and student ID or staff department." });
    const current = await User.findOne({ _id: req.params.id, ...managedRoles }).lean();
    if (!current) return res.status(404).json({ message: "Student or staff account not found." });
    if (!await departmentAvailable(input, current)) return res.status(400).json({ message: "Select an active, available department for this staff member." });
    const blocked = await outstandingWork(current, input);
    if (blocked) return res.status(409).json({ message: blocked });
    // Revoke sessions on profile changes so cached names, roles and office assignments are refreshed at sign-in.
    const account = await present(User.findOneAndUpdate(
      { _id: current._id, ...managedRoles, updatedAt: versionFilter(req.body.updatedAt) },
      { $set: input, $inc: { sessionVersion: 1 },
        ...(input.email !== current.email ? { $unset: { googleId: "" } } : {}),
      }, { returnDocument: "after", runValidators: true }));
    if (!account) return conflict(res);
    res.json({ account, message: "Account updated. The user must sign in again." });
  } catch (error) { handleError(error, res, next); }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ message: "Choose an active or disabled account status." });
    const current = await User.findOne({ _id: req.params.id, ...managedRoles }).lean();
    if (!current) return res.status(404).json({ message: "Student or staff account not found." });
    const blocked = await outstandingWork(current, { ...current, isActive: req.body.isActive });
    if (blocked) return res.status(409).json({ message: blocked });
    const account = await present(User.findOneAndUpdate(
      { _id: current._id, ...managedRoles, updatedAt: versionFilter(req.body.updatedAt) },
      { $set: { isActive: req.body.isActive }, $inc: { sessionVersion: 1 } },
      { returnDocument: "after", runValidators: true }));
    if (!account) return conflict(res);
    res.json({ account, message: req.body.isActive ? "Account enabled. The user can sign in again." : "Account disabled. Previous sessions have been revoked." });
  } catch (error) { next(error); }
});

module.exports = router;
