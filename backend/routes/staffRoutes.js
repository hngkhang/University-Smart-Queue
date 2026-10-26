const express = require("express");
const { publishQueueUpdate } = require("../lib/queueEvents");
const mongoose = require("mongoose");
const requireRole = require("../middleware/requireRole");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");
const { admitDueAppointments } = require("../lib/appointmentQueue");
const { dayEndsAt, cancelEndedTickets } = require("../lib/ticketExpiry");
const { dateInVietnam } = require("../lib/appointmentSchedule");
const dayHasEnded = (department) => new Date() >= dayEndsAt(dateInVietnam(), department.workingHours);

const router = express.Router();
const currentStatuses = ["called", "serving"];
router.use(requireRole("staff"));
router.use(async (req, res, next) => {
  const department = req.user.department && await Department.findById(req.user.department).lean();
  if (!department || department.isArchived)
    return res.status(403).json({ message: "Your account has no available assigned office. Please contact your administrator." });
  req.department = department;
  // Queue reads and calls run cleanup through appointment admission below.
  if (req.path !== "/queue" && req.path !== "/queue/call") {
    await cancelEndedTickets({ department: department._id });
  }
  next();
});

const visitQuery = (query) => query.populate("student", "fullName studentID").lean();
const visit = (ticket) => ({
  id: ticket._id,
  reference: `Q-${String(ticket.number).padStart(3, "0")}`,
  appointmentReference: ticket.appointment ? `APT-${ticket.appointment}` : null,
  appointmentStartsAt: ticket.appointmentStartsAt ? new Date(ticket.appointmentStartsAt).getTime() : undefined,
  name: ticket.student?.fullName || "Student unavailable",
  studentId: ticket.student?.studentID || "—",
  services: ticket.services.map((service) => ({ name: service.name, duration: service.estimatedDuration })),
  notes: ticket.notes,
  joinedAt: new Date(ticket.createdAt).getTime(),
  status: ticket.status,
  calledAt: ticket.calledAt ? new Date(ticket.calledAt).getTime() : undefined,
  startedAt: ticket.startedAt ? new Date(ticket.startedAt).getTime() : undefined,
  finishedAt: new Date(ticket.completedAt || ticket.cancelledAt || ticket.noShowAt || ticket.updatedAt).getTime(),
});

router.get("/queue", async (req, res) => {
  const department = req.department._id;
  await admitDueAppointments({ department });
  const vietnamDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [current, waiting, history, queue, completedToday] = await Promise.all([
    visitQuery(Ticket.findOne({ department, assignedStaff: req.user._id, status: { $in: currentStatuses } })),
    visitQuery(Ticket.find({ department, status: "waiting" }).sort({ serviceDate: 1, number: 1 })),
    visitQuery(Ticket.find({ department, status: { $in: ["completed", "cancelled", "no_show"] } }).sort({ updatedAt: -1 }).limit(50)),
    Queue.findOne({ department }).lean(),
    Ticket.countDocuments({ department, assignedStaff: req.user._id, status: "completed", completedAt: { $gte: new Date(`${vietnamDate}T00:00:00+07:00`) } }),
  ]);
  res.json({ current: current ? visit(current) : null, waiting: waiting.map(visit), history: history.map(visit), paused: !!queue?.isPaused, isOpen: !!queue?.isOpen && req.department.isActive && !dayHasEnded(req.department), completedToday });
});

router.patch("/queue/pause", async (req, res) => {
  if (typeof req.body?.paused !== "boolean")
    return res.status(400).json({ message: "Choose whether to pause calls." });
  const queue = await Queue.findOneAndUpdate({ department: req.department._id }, { $set: { isPaused: req.body.paused } }, { returnDocument: "after" }).lean();
  if (!queue) return res.status(409).json({ message: "Your office queue has not been opened yet." });
  publishQueueUpdate();
  res.json({ paused: queue.isPaused });
});

router.post("/queue/call", async (req, res) => {
  const department = req.department._id;
  await admitDueAppointments({ department });
  const queue = await Queue.findOne({ department }).lean();
  if (!req.department.isActive || !queue?.isOpen || queue.isPaused || dayHasEnded(req.department))
    return res.status(409).json({ message: "New calls are unavailable while the office is closed or paused." });
  if (await Ticket.exists({ assignedStaff: req.user._id, status: { $in: currentStatuses } }))
    return res.status(409).json({ message: "Finish your current visit before calling another student." });
  const now = new Date();
  // Claim and status change commit together; the unique staff index prevents double claims.
  const ticket = await Ticket.findOneAndUpdate(
    { department, status: "waiting" },
    {
      $set: { status: "called", assignedStaff: req.user._id, assignedStaffName: req.user.fullName, calledAt: now, lastCalledAt: now },
      $push: { statusHistory: { status: "called", at: now, actor: req.user._id } },
    },
    { sort: { serviceDate: 1, number: 1 }, returnDocument: "after" },
  ).lean();
  if (!ticket) return res.status(409).json({ message: "No students are waiting. Refresh your queue." });
  publishQueueUpdate();
  res.json({ message: `Q-${String(ticket.number).padStart(3, "0")} has been called.` });
});

const transitions = {
  start: { from: ["called"], status: "serving", timestamp: "startedAt" },
  complete: { from: ["serving"], status: "completed", timestamp: "completedAt" },
  no_show: { from: ["called"], status: "no_show", timestamp: "noShowAt" },
  cancel: { from: ["waiting", "called", "serving"], status: "cancelled", timestamp: "cancelledAt" },
  recall: { from: ["called"], status: "called", timestamp: "lastCalledAt" },
};
router.patch("/tickets/:id/:action", async (req, res) => {
  const transition = Object.hasOwn(transitions, req.params.action) && transitions[req.params.action];
  if (!mongoose.isObjectIdOrHexString(req.params.id) || !transition)
    return res.status(400).json({ message: "Invalid ticket action." });
  const now = new Date();
  const ticket = await Ticket.findOneAndUpdate({
    _id: req.params.id,
    department: req.department._id,
    status: { $in: transition.from },
    // Waiting tickets may be cancelled by the office; claimed tickets belong to their staff member.
    $or: [{ assignedStaff: req.user._id }, ...(req.params.action === "cancel" ? [{ status: "waiting" }] : [])],
  }, {
    $set: { status: transition.status, [transition.timestamp]: now },
    ...(req.params.action === "recall" ? {} : { $push: { statusHistory: { status: transition.status, at: now, actor: req.user._id } } }),
  }, { returnDocument: "after" }).lean();
  if (!ticket) return res.status(409).json({ message: "This visit changed or belongs to another staff member. Refresh your queue." });
  if (ticket.appointment && req.params.action === "cancel") {
    await Appointment.updateOne({ _id: ticket.appointment, status: "confirmed" },
      { $set: { status: "cancelled", cancelledAt: now } });
  }
  publishQueueUpdate();
  res.json({ message: req.params.action === "recall" ? "Student called again." : "Visit status updated." });
});

router.use((error, _req, res, _next) => {
  if (error.code === 11000)
    return res.status(409).json({ message: "You already have a current visit. Refresh your queue." });
  console.error("Staff queue request failed:", error.message);
  res.status(500).json({ message: "Unable to update the queue. Refresh before trying again." });
});
module.exports = router;
