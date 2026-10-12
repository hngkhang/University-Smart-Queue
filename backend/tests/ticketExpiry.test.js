const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const Department = require("../models/Department");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const Queue = require("../models/Queue");
const { dayEndsAt, cancelEndedTickets } = require("../lib/ticketExpiry");
const { reservedMinutes } = require("../lib/appointmentSchedule");
const { admitDueAppointments } = require("../lib/appointmentQueue");
const databaseName = `smartqueue_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
process.env.JWT_SECRET = randomUUID();
let office, server, base;
const closing = new Date("2026-10-12T16:30:00+07:00");

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  await Promise.all([Ticket.init(), Appointment.init(), User.init()]);
  const app = express();
  app.use(express.json());
  app.use("/appointments", require("../routes/appointmentRoutes"));
  app.use("/queue", require("../routes/queueRoutes"));
  app.use("/staff", require("../routes/staffRoutes"));
  app.use("/departments", require("../routes/departmentRoutes"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Promise.all([Ticket.deleteMany({}), Appointment.deleteMany({}), Department.deleteMany({}), User.deleteMany({}), Queue.deleteMany({})]);
  office = await Department.create({ name: "Registrar", workingHours: "07:30 - 11:30 | 13:00 - 16:30" });
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("smartqueue_test_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});
async function ticket(status, number, extra = {}) {
  return Ticket.create({ student: new mongoose.Types.ObjectId(), department: office._id, departmentName: office.name,
    serviceDate: "2026-10-12", number, services: [{ name: "Transcript" }], status,
    statusHistory: [{ status, at: new Date("2026-10-12T09:00:00+07:00") }], ...extra });
}
async function appointment(student = new mongoose.Types.ObjectId(), day = "2026-10-12", offset = 0) {
  const startsAt = new Date(new Date(`${day}T14:00:00+07:00`).getTime() + offset * 30 * 60000), endsAt = new Date(startsAt.getTime() + 20 * 60000);
  return Appointment.create({ student, department: office._id, departmentName: office.name, location: "Campus", services: [{ name: "Transcript", estimatedDuration: 20 }], estimatedServiceTime: 20, startsAt, endsAt, reservedMinutes: reservedMinutes(startsAt, endsAt) });
}

test("closing uses Vietnam time, final period, default hours and safe malformed-hours fallback", () => {
  assert.equal(dayEndsAt("2026-10-12", office.workingHours).toISOString(), "2026-10-12T09:30:00.000Z");
  assert.equal(dayEndsAt("2026-10-12", "").toISOString(), "2026-10-12T09:30:00.000Z");
  assert.equal(dayEndsAt("2026-10-12", "unknown").toISOString(), "2026-10-12T17:00:00.000Z");
});
test("lunch and the last second before closing preserve tickets; closing cancels waiting/called only", async () => {
  const statuses = ["waiting", "called", "serving", "completed", "no_show", "cancelled"];
  const tickets = await Promise.all(statuses.map((status, i) => ticket(status, i + 1)));
  assert.equal(await cancelEndedTickets({ now: new Date("2026-10-12T12:00:00+07:00") }), 0);
  assert.equal(await cancelEndedTickets({ now: new Date(closing.getTime() - 1) }), 0);
  assert.equal(await cancelEndedTickets({ now: closing }), 2);
  for (let i = 0; i < tickets.length; i++) {
    const saved = await Ticket.findById(tickets[i]._id).lean();
    assert.equal(saved.status, i < 2 ? "cancelled" : statuses[i]);
    if (i < 2) {
      assert.equal(saved.cancellationReason, "end_of_day");
      assert.equal(saved.cancelledAt.getTime(), closing.getTime());
      assert.equal(saved.statusHistory.at(-1).actor, null);
    } else assert.equal(saved.cancellationReason, null);
  }
  await Promise.all(Array.from({ length: 3 }, () => cancelEndedTickets({ now: closing })));
  assert.equal((await Ticket.findById(tickets[0]._id)).statusHistory.length, 2);
});
test("closing cancels linked and unadmitted appointments, preserving serving and no-show results", async () => {
  const appointments = await Promise.all(Array.from({ length: 4 }, (_, i) => appointment(undefined, undefined, i)));
  await ticket("waiting", 1, { student: appointments[0].student, appointment: appointments[0]._id });
  await ticket("serving", 2, { student: appointments[1].student, appointment: appointments[1]._id });
  await ticket("no_show", 3, { student: appointments[2].student, appointment: appointments[2]._id });
  await cancelEndedTickets({ now: closing });
  for (let i = 0; i < appointments.length; i++) {
    const saved = await Appointment.findById(appointments[i]._id);
    assert.equal(saved.status, i === 0 || i === 3 ? "cancelled" : "confirmed");
  }
  assert.equal(await admitDueAppointments({ now: closing }), 0);
  assert.equal(await Ticket.countDocuments({ appointment: appointments[3]._id }), 0);
});
test("restart catch-up cancels yesterday's tickets, releases the active restriction and respects scope", async () => {
  const old = await ticket("waiting", 1, { serviceDate: "2026-10-11" });
  const other = await ticket("waiting", 2, { serviceDate: "2026-10-11" });
  assert.equal(await cancelEndedTickets({ now: new Date("2026-10-12T07:00:00+07:00"), student: old.student }), 1);
  assert.equal((await Ticket.findById(other._id)).status, "waiting");
  await ticket("waiting", 3, { student: old.student });
});
test("each office closes at its own final period and future service dates remain valid", async () => {
  const laterOffice = await Department.create({ name: "Finance", workingHours: "08:00 - 18:00" });
  const early = await ticket("waiting", 1);
  const later = await ticket("called", 1, { department: laterOffice._id });
  const tomorrow = await ticket("waiting", 2, { serviceDate: "2026-10-13" });
  assert.equal(await cancelEndedTickets({ now: closing }), 1);
  assert.equal((await Ticket.findById(early._id)).status, "cancelled");
  assert.equal((await Ticket.findById(later._id)).status, "called");
  assert.equal((await Ticket.findById(tomorrow._id)).status, "waiting");
  assert.equal(await cancelEndedTickets({ now: new Date("2026-10-12T18:00:00+07:00") }), 1);
});
test("student APIs expose the day-end reason and move stale tickets to history", async () => {
  const owner = await User.create({ fullName: "Test Student", email: `${randomUUID()}@example.test`, password: "unused", role: "student" });
  const visit = await appointment(owner._id, "2020-01-01");
  await ticket("waiting", 1, { serviceDate: "2020-01-01", student: owner._id, appointment: visit._id });
  const token = jwt.sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const request = async (path) => {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const mine = (await request("/appointments")).appointments[0];
  assert.equal(mine.status, "cancelled");
  assert.equal(mine.serviceStatus, "cancelled");
  assert.equal(mine.cancellationReason, "end_of_day");
  const queue = await request("/queue/mine");
  assert.equal(queue.ticket, null);
  assert.equal(queue.history[0].cancellationReason, "end_of_day");
});
test("after closing APIs show a closed office, reject new entries and let staff finish serving", async (t) => {
  const staff = await User.create({ fullName: "Test Staff", email: `${randomUUID()}@example.test`, password: "unused", role: "staff", department: office._id });
  const owner = await User.create({ fullName: "Test Student", email: `${randomUUID()}@example.test`, password: "unused", role: "student" });
  await Queue.create({ department: office._id, isOpen: true });
  const waiting = await ticket("waiting", 1, { student: owner._id });
  const serving = await ticket("serving", 2, { assignedStaff: staff._id });
  t.mock.timers.enable({ apis: ["Date"], now: closing.getTime() });
  const staffToken = jwt.sign({ id: staff.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const studentToken = jwt.sign({ id: owner.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const request = async (path, token, method = "GET", body) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const queue = await request("/staff/queue", staffToken);
  assert.equal(queue.status, 200);
  assert.equal(queue.data.isOpen, false);
  assert.equal(queue.data.waiting.length, 0);
  assert.equal(queue.data.current.id, serving.id);
  assert.equal((await Ticket.findById(waiting._id)).status, "cancelled");
  assert.equal((await request("/departments")).data.departments[0].status, "closed");
  const joined = await request("/queue", studentToken, "POST", { departmentId: office.id, services: ["Transcript"] });
  assert.equal(joined.status, 409);
  assert.match(joined.data.message, /not accepting/);
  assert.equal((await request("/staff/queue/call", staffToken, "POST")).status, 409);
  assert.equal((await request(`/staff/tickets/${serving.id}/complete`, staffToken, "PATCH")).status, 200);
});
