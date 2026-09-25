const express = require("express");
const mongoose = require("mongoose");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const QueueTicket = require("../models/QueueTicket");
const QueueSequence = require("../models/QueueSequence");
const studentAuth = require("../middleware/studentAuth");

const router = express.Router();
const activeStatuses = ["waiting", "called", "serving"];
const activeFor = (student) => ({ student, status: { $in: activeStatuses } });
const serviceDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

async function ticketResponse(ticket) {
  const active = activeStatuses.includes(ticket.status);
  const [department, queue, peopleAhead] = await Promise.all([
    Department.findById(ticket.department).lean(),
    Queue.findOne({ department: ticket.department }).lean(),
    active
      ? QueueTicket.countDocuments({
          department: ticket.department,
          status: { $in: activeStatuses },
          $or: [
            { serviceDate: { $lt: ticket.serviceDate } },
            { serviceDate: ticket.serviceDate, number: { $lt: ticket.number } },
          ],
        })
      : Promise.resolve(null),
  ]);
  return {
    ...ticket,
    reference: `Q-${String(ticket.number).padStart(3, "0")}`,
    location: department?.location
      ? `HCMUTE Campus (${department.location.x}, ${department.location.y})`
      : "HCMUTE Campus",
    queueStatus:
      !department?.isActive || !queue?.isOpen
        ? "closed"
        : queue.isPaused
          ? "paused"
          : "open",
    peopleAhead,
    // Counter availability and service progress are not yet tracked.
    estimatedWait: null,
  };
}

router.use(studentAuth);

router.get("/mine", async (req, res) => {
  const [active, history] = await Promise.all([
    QueueTicket.findOne(activeFor(req.student._id)).lean(),
    QueueTicket.find({
      student: req.student._id,
      status: { $nin: activeStatuses },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);
  return res.json({
    ticket: active ? await ticketResponse(active) : null,
    history: await Promise.all(history.map(ticketResponse)),
  });
});

router.post("/", async (req, res) => {
  const { departmentId, services, notes = "" } = req.body || {};
  if (
    !mongoose.isObjectIdOrHexString(departmentId) ||
    !Array.isArray(services) ||
    services.length === 0 ||
    services.length > 50 ||
    services.some((name) => typeof name !== "string") ||
    new Set(services).size !== services.length ||
    typeof notes !== "string" ||
    notes.length > 1000
  ) {
    return res
      .status(400)
      .json({
        message:
          "Select valid services and keep notes within 1,000 characters.",
      });
  }
  const existing = await QueueTicket.findOne(activeFor(req.student._id)).lean();
  if (existing) {
    return res
      .status(409)
      .json({
        code: "ACTIVE_TICKET",
        message: "You already have an active ticket. View it in My Queue.",
      });
  }
  const [department, queue] = await Promise.all([
    Department.findById(departmentId).lean(),
    Queue.findOne({ department: departmentId }).lean(),
  ]);
  if (!department)
    return res.status(404).json({ message: "Department not found." });
  if (!department.isActive || !queue?.isOpen || queue.isPaused) {
    return res
      .status(409)
      .json({
        message: "This department is not accepting queue entries right now.",
      });
  }
  const selected = services.map((name) =>
    department.services.find((service) => service.name === name),
  );
  if (selected.some((service) => !service)) {
    return res
      .status(400)
      .json({
        message:
          "Some services are no longer available. Refresh the department and select again.",
      });
  }
  const snapshots = selected.map((service) => ({
    name: service.name,
    estimatedDuration:
      Number.isFinite(service.estimatedDuration) &&
      service.estimatedDuration > 0
        ? service.estimatedDuration
        : null,
  }));
  const date = serviceDate();
  // Atomic sequence allocation; gaps after failed requests are intentional.
  const sequence = await QueueSequence.findOneAndUpdate(
    { _id: `${department._id}:${date}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  let ticket;
  try {
    ticket = await QueueTicket.create({
      student: req.student._id,
      department: department._id,
      departmentName: department.name,
      serviceDate: date,
      number: sequence.value,
      services: snapshots,
      notes: notes.trim(),
      estimatedServiceTime: snapshots.every(
        (service) => service.estimatedDuration !== null,
      )
        ? snapshots.reduce((sum, service) => sum + service.estimatedDuration, 0)
        : null,
    });
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?.student) {
      return res
        .status(409)
        .json({
          code: "ACTIVE_TICKET",
          message: "You already have an active ticket. View it in My Queue.",
        });
    }
    throw error;
  }
  return res
    .status(201)
    .json({ ticket: await ticketResponse(ticket.toObject()) });
});

router.patch("/:id/cancel", async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return res.status(400).json({ message: "Invalid ticket." });
  }
  const ticket = await QueueTicket.findOneAndUpdate(
    {
      _id: req.params.id,
      student: req.student._id,
      status: "waiting",
    },
    { $set: { status: "cancelled", cancelledAt: new Date() } },
    { returnDocument: "after" },
  ).lean();
  if (!ticket)
    return res
      .status(409)
      .json({
        message: "This ticket can no longer be cancelled. Refresh My Queue.",
      });
  return res.json({ ticket: await ticketResponse(ticket) });
});

router.use((error, _req, res, _next) => {
  console.error("Queue request failed:", error.message);
  res
    .status(500)
    .json({
      message:
        "Unable to update your queue right now. Check My Queue before trying again.",
    });
});

module.exports = router;
