const express = require("express");
const { publishQueueUpdate } = require("../lib/queueEvents");
const mongoose = require("mongoose");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const QueueTicket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");
const { DEFAULT_WORKING_HOURS, workingPeriods } = require("../lib/appointmentSchedule");

const router = express.Router();
const activeFilter = { isArchived: { $ne: true } };
const textField = (value, max, required = false) =>
  typeof value === "string" && value.trim().length <= max && (!required || value.trim())
    ? value.trim()
    : null;
const validDate = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function parseDepartment(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const name = textField(body.name, 120, true);
  const vietnameseName = textField(body.vietnameseName, 120);
  const description = textField(body.description, 1000);
  const location = textField(body.location, 200, true);
  const workingHours = textField(body.workingHours, 120, true);
  if (!name || vietnameseName === null || description === null || !location ||
      !workingHours || !workingPeriods(workingHours).length ||
      typeof body.isActive !== "boolean" || typeof body.bookingEnabled !== "boolean" ||
      !Array.isArray(body.services) || body.services.length > 50 ||
      !Array.isArray(body.bookingWeekdays) || body.bookingWeekdays.length > 7 ||
      body.bookingWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) ||
      new Set(body.bookingWeekdays).size !== body.bookingWeekdays.length ||
      !Array.isArray(body.bookingExcludedDates) || body.bookingExcludedDates.length > 100 ||
      body.bookingExcludedDates.some((day) => typeof day !== "string" || !validDate(day)) ||
      new Set(body.bookingExcludedDates).size !== body.bookingExcludedDates.length) return null;
  const services = body.services.map((service) => ({
    name: textField(service?.name, 120, true),
    description: textField(service?.description === undefined ? "" : service.description, 1000),
    estimatedDuration: service?.estimatedDuration,
  }));
  if (services.some((service) => !service.name || service.description === null || !Number.isInteger(service.estimatedDuration) ||
      service.estimatedDuration < 1 || service.estimatedDuration > 1440) ||
      new Set(services.map((service) => service.name.toLocaleLowerCase())).size !== services.length) return null;
  return {
    name, vietnameseName, description, location: { label: location }, workingHours,
    isActive: body.isActive, bookingEnabled: body.bookingEnabled,
    bookingWeekdays: body.bookingWeekdays, bookingExcludedDates: body.bookingExcludedDates,
    services,
  };
}

function present(department) {
  return {
    id: department._id.toString(),
    name: department.name,
    vietnameseName: department.vietnameseName || "",
    description: department.description || "",
    location: department.location?.label || "",
    workingHours: department.workingHours || DEFAULT_WORKING_HOURS,
    isActive: department.isActive !== false,
    bookingEnabled: department.bookingEnabled !== false,
    bookingWeekdays: department.bookingWeekdays ?? [1, 2, 3, 4, 5],
    bookingExcludedDates: department.bookingExcludedDates ?? [],
    services: (department.services || []).map(({ name, estimatedDuration, description = "" }) => ({ name, estimatedDuration, description })),
  };
}

async function duplicateName(name, exceptId) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Department.exists({ ...activeFilter, name: { $regex: `^${escaped}$`, $options: "i" },
    ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
}

async function hasOutstandingWork(departmentId) {
  const [ticket, appointment] = await Promise.all([
    QueueTicket.exists({ department: departmentId, status: { $in: ["waiting", "called", "serving"] } }),
    Appointment.exists({ department: departmentId, status: "confirmed", endsAt: { $gt: new Date() } }),
  ]);
  return Boolean(ticket || appointment);
}

router.get("/", async (_req, res, next) => {
  try {
    const departments = await Department.find(activeFilter).sort({ name: 1 }).lean();
    res.json({ departments: departments.map(present) });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = parseDepartment(req.body);
    if (!input) return res.status(400).json({ message: "Check the department name, location, hours, services and booking settings." });
    if (await duplicateName(input.name)) return res.status(409).json({ message: "A department with this name already exists." });
    const department = await Department.create(input);
    res.status(201).json({ department: present(department) });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Invalid department." });
    const input = parseDepartment(req.body);
    if (!input) return res.status(400).json({ message: "Check the department name, location, hours, services and booking settings." });
    if (await duplicateName(input.name, req.params.id)) return res.status(409).json({ message: "A department with this name already exists." });
    if (!input.isActive && await hasOutstandingWork(req.params.id)) return res.status(409).json({
      message: "This department has active tickets or future appointments. Resolve them before making it inactive.",
    });
    const department = await Department.findOneAndUpdate({ _id: req.params.id, ...activeFilter },
      { $set: input }, { returnDocument: "after", runValidators: true }).lean();
    if (!department) return res.status(404).json({ message: "Department not found." });
    if (!department.isActive) await Queue.updateMany({ department: department._id }, { $set: { isOpen: false, isPaused: false } });
    publishQueueUpdate();
    res.json({ department: present(department) });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ message: "Invalid department." });
    const department = await Department.findOne({ _id: req.params.id, ...activeFilter }).lean();
    if (!department) return res.status(404).json({ message: "Department not found." });
    if (await hasOutstandingWork(department._id)) return res.status(409).json({
      message: "This department has active tickets or future appointments. Resolve them before deleting it.",
    });
    await Department.updateOne({ _id: department._id, ...activeFilter },
      { $set: { isArchived: true, isActive: false, bookingEnabled: false } });
    await Queue.updateMany({ department: department._id }, { $set: { isOpen: false, isPaused: false } });
    publishQueueUpdate();
    res.json({ message: "Department deleted." });
  } catch (error) { next(error); }
});

module.exports = router;
