const express = require("express");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Department = require("../models/Department");
const studentAuth = require("../middleware/studentAuth");
const officeLocation = require("../lib/officeLocation");
const { validBookingDate, slotsFor, reservedMinutes } = require("../lib/appointmentSchedule");

const router = express.Router();
router.use(studentAuth);
router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

function response(appointment) {
  const { reservedMinutes: _minutes, student: _student, __v: _version, ...result } = appointment;
  return { ...result, reference: `APT-${appointment._id}` };
}

async function selection(input, res) {
  const { departmentId, services, date } = input;
  if (!mongoose.isObjectIdOrHexString(departmentId) || !validBookingDate(date) ||
      !Array.isArray(services) || services.length < 1 || services.length > 50 ||
      services.some((name) => typeof name !== "string") || new Set(services).size !== services.length) {
    res.status(400).json({ message: "Select services and a date within the next 30 days." });
    return null;
  }
  const department = await Department.findById(departmentId).lean();
  if (!department) {
    res.status(404).json({ message: "Department not found." });
    return null;
  }
  if (!department.isActive || department.bookingEnabled === false) {
    res.status(409).json({ message: "This department is not accepting appointments." });
    return null;
  }
  const chosen = services.map((name) => department.services.find((service) => service.name === name));
  if (chosen.some((service) => !service || !Number.isInteger(service.estimatedDuration) || service.estimatedDuration <= 0)) {
    res.status(400).json({ message: "Select available services with a configured duration. Refresh the page and try again." });
    return null;
  }
  const snapshots = chosen.map(({ name, estimatedDuration }) => ({ name, estimatedDuration }));
  const duration = snapshots.reduce((sum, service) => sum + service.estimatedDuration, 0);
  return { department, services: snapshots, duration, slots: slotsFor(department, date, duration) };
}

async function withAvailability(selected, student) {
  if (!selected.slots.length) return [];
  const occupied = await Appointment.find({
    status: "confirmed",
    $or: [{ department: selected.department._id }, { student }],
    startsAt: { $lt: selected.slots.at(-1).endsAt },
    endsAt: { $gt: selected.slots[0].startsAt },
  }).select("startsAt endsAt").lean();
  return selected.slots.map((slot) => ({
    ...slot,
    available: !occupied.some((visit) => visit.startsAt < slot.endsAt && visit.endsAt > slot.startsAt),
  }));
}

router.get("/availability", async (req, res) => {
  const services = typeof req.query.services === "string" ? [req.query.services] : req.query.services;
  const selected = await selection({ ...req.query, services }, res);
  if (!selected) return;
  res.json({ slots: await withAvailability(selected, req.student._id) });
});

router.get("/", async (req, res) => {
  const appointments = await Appointment.find({ student: req.student._id }).sort({ startsAt: -1 }).lean();
  res.json({ appointments: appointments.map(response) });
});

router.post("/", async (req, res) => {
  const { startsAt, notes = "" } = req.body || {};
  if (typeof startsAt !== "string" || typeof notes !== "string" || notes.length > 1000) {
    return res.status(400).json({ message: "Choose a time and keep notes within 1,000 characters." });
  }
  const selected = await selection(req.body, res);
  if (!selected) return;
  const requestedTime = new Date(startsAt).getTime();
  const slot = selected.slots.find((candidate) => candidate.startsAt.getTime() === requestedTime);
  if (!slot) return res.status(409).json({ message: "This time no longer fits your services. Please choose another time." });
  const { department, services, duration } = selected;
  try {
    const appointment = await Appointment.create({
      student: req.student._id,
      department: department._id,
      departmentName: department.name,
      location: officeLocation(department.location),
      services,
      estimatedServiceTime: duration,
      ...slot,
      reservedMinutes: reservedMinutes(slot.startsAt, slot.endsAt),
      notes: notes.trim(),
    });
    return res.status(201).json({ appointment: response(appointment.toObject()) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({
      message: "This time overlaps an existing appointment. Please choose another time.",
    });
    throw error;
  }
});

router.patch("/:id/cancel", async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Invalid appointment." });
  const appointment = await Appointment.findOneAndUpdate({
    _id: req.params.id, student: req.student._id, status: "confirmed", startsAt: { $gt: new Date() },
  }, { $set: { status: "cancelled", cancelledAt: new Date() } }, { returnDocument: "after" }).lean();
  if (!appointment) return res.status(409).json({ message: "This appointment can no longer be cancelled. Refresh My Appointments." });
  res.json({ appointment: response(appointment) });
});

router.use((error, _req, res, _next) => {
  console.error("Appointment request failed:", error.message);
  res.status(500).json({ message: "Unable to update your appointment. Check My Appointments before trying again." });
});

module.exports = router;
