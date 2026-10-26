const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { io: connectSocket } = require("socket.io-client");
const { attachQueueRealtime } = require("../lib/queueRealtime");
require("dotenv").config({ quiet: true });
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const User = require("../models/User");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");
const { admitDueAppointments } = require("../lib/appointmentQueue");
const { reservedMinutes } = require("../lib/appointmentSchedule");
const databaseName = `smartqueue_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
process.env.JWT_SECRET = randomUUID();
let server, realtime, base, office, otherOffice, staff, colleague, outsider;
async function account(role, department, isActive = true) {
  const user = await User.create({ fullName: `Test ${role}`, email: `${randomUUID()}@example.test`, password: "unused", role, department, isActive, studentID: role === "student" ? "23110055" : "" });
  return { user, token: jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
}
async function request(path, token, method = "GET", body) {
  const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function join(department = office) {
  const student = await account("student");
  const result = await request("/queue", student.token, "POST", { departmentId: department.id, services: ["Transcript"] });
  assert.equal(result.status, 201);
  return { ...student, ticket: result.data.ticket };
}
const call = (who = staff) => request("/staff/queue/call", who.token, "POST");
const act = (id, action, who = staff) => request(`/staff/tickets/${id}/${action}`, who.token, "PATCH");
const mine = (who) => request("/queue/mine", who.token);

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", { dbName: databaseName, serverSelectionTimeoutMS: 10000 });
  await Promise.all([Ticket.init(), Appointment.init(), User.init()]);
  const app = express();
  app.use(express.json());
  app.use("/staff", require("../routes/staffRoutes"));
  app.use("/queue", require("../routes/queueRoutes"));
  app.use("/appointments", require("../routes/appointmentRoutes"));
  server = app.listen(0, "127.0.0.1");
  realtime = attachQueueRealtime(server, { isAllowedOrigin: (origin) => origin === "http://localhost:5173" });
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await Promise.all([Ticket.deleteMany({}), Appointment.deleteMany({}), User.deleteMany({}), Department.deleteMany({}), Queue.deleteMany({})]);
  [office, otherOffice] = await Department.create([{ name: "Registrar", workingHours: "00:00 - 23:59", services: [{ name: "Transcript", estimatedDuration: 10 }] }, { name: "Finance", workingHours: "00:00 - 23:59", services: [{ name: "Transcript", estimatedDuration: 10 }] }]);
  await Queue.create([{ department: office._id, isOpen: true }, { department: otherOffice._id, isOpen: true }]);
  [staff, colleague, outsider] = await Promise.all([account("staff", office._id), account("staff", office._id), account("staff", otherOffice._id)]);
});
after(async () => {
  if (realtime) await new Promise((resolve) => realtime.close(resolve));
  else if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("smartqueue_test_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

function socketEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, received);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 4000);
    const received = (...args) => { clearTimeout(timer); resolve(args); };
    socket.once(event, received);
  });
}

async function liveClient(t, token, options = {}) {
  const socket = connectSocket(base, {
    transports: ["websocket"], auth: { token }, autoConnect: false,
    reconnection: false, ...options,
  });
  t.after(() => socket.disconnect());
  const connected = socketEvent(socket, "connect");
  socket.connect();
  await connected;
  assert.equal(socket.io.engine.transport.name, "websocket");
  return socket;
}

test("WebSocket pushes each saved staff transition to students and colleagues without polling", async (t) => {
  const student = await join();
  const nextStudent = await join();
  const studentSocket = await liveClient(t, student.token);
  const colleagueSocket = await liveClient(t, colleague.token);
  for (const [action, status] of [["call", "called"], ["recall", "called"], ["start", "serving"], ["complete", "completed"]]) {
    const updates = [socketEvent(studentSocket, "queue:updated"), socketEvent(colleagueSocket, "queue:updated")];
    const response = action === "call" ? await call() : await act(student.ticket._id, action);
    assert.equal(response.status, 200);
    // The broadcast contains no student names, ticket IDs or other private data.
    for (const args of await Promise.all(updates)) assert.deepEqual(args, []);
    const snapshot = (await mine(student)).data;
    const ticket = snapshot.ticket || snapshot.history[0];
    assert.equal(ticket.status, status);
    if (action === "recall") assert.ok(new Date(ticket.lastCalledAt) >= new Date(ticket.calledAt));
  }
  assert.equal((await mine(nextStudent)).data.ticket.peopleAhead, 0);
});

test("WebSocket notifies staff about joins, student cancellations, pauses and automatic admission", async (t) => {
  const socket = await liveClient(t, staff.token);
  let update = socketEvent(socket, "queue:updated");
  const student = await join();
  await update;
  update = socketEvent(socket, "queue:updated");
  assert.equal((await request(`/queue/${student.ticket._id}/cancel`, student.token, "PATCH")).status, 200);
  await update;
  for (const paused of [true, false]) {
    update = socketEvent(socket, "queue:updated");
    assert.equal((await request("/staff/queue/pause", staff.token, "PATCH", { paused })).status, 200);
    await update;
  }
  const owner = await account("student");
  await scheduledFor(owner);
  update = socketEvent(socket, "queue:updated");
  assert.equal(await admitDueAppointments(), 1);
  await update;
});

test("WebSocket rejects invalid, expired, inactive and revoked sessions and untrusted origins", async (t) => {
  const inactive = await account("student", undefined, false);
  const revoked = await account("student");
  await User.updateOne({ _id: revoked.user._id }, { $inc: { sessionVersion: 1 } });
  const admin = await account("admin");
  const expired = jwt.sign({ id: staff.user.id }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of [undefined, "invalid", expired, inactive.token, revoked.token, admin.token]) {
    const socket = connectSocket(base, { transports: ["websocket"], auth: { token }, autoConnect: false, reconnection: false });
    t.after(() => socket.disconnect());
    const failure = socketEvent(socket, "connect_error");
    socket.connect();
    const [error] = await failure;
    assert.match(error.message, /sign in again/);
    assert.equal(socket.connected, false);
  }
  const socket = connectSocket(base, {
    transports: ["websocket"], auth: { token: staff.token }, autoConnect: false,
    reconnection: false, extraHeaders: { Origin: "https://untrusted.example" },
  });
  t.after(() => socket.disconnect());
  const failure = socketEvent(socket, "connect_error");
  socket.connect();
  await failure;
  assert.equal(socket.connected, false);
});

test("WebSocket reconnects after transport loss and can load changes missed offline", async (t) => {
  const student = await join();
  const socket = await liveClient(t, student.token, { reconnection: true, reconnectionDelay: 200, randomizationFactor: 0 });
  const disconnected = socketEvent(socket, "disconnect");
  const reconnected = socketEvent(socket, "connect");
  realtime.sockets.sockets.get(socket.id).conn.close();
  await disconnected;
  assert.equal((await call()).status, 200);
  await reconnected;
  assert.equal((await mine(student)).data.ticket.status, "called");
  const update = socketEvent(socket, "queue:updated");
  await act(student.ticket._id, "start");
  await update;
  assert.equal((await mine(student)).data.ticket.status, "serving");
});

test("WebSocket closes when its authenticated token expires", async (t) => {
  const token = jwt.sign({ id: staff.user.id }, process.env.JWT_SECRET, { expiresIn: 2 });
  const socket = await liveClient(t, token);
  const [reason] = await socketEvent(socket, "disconnect");
  assert.equal(reason, "io server disconnect");
});

test("real staff transitions are visible to students and persist after reload", async () => {
  const student = await join();
  const id = student.ticket._id;
  assert.equal((await call()).status, 200);
  let ticket = (await mine(student)).data.ticket;
  assert.equal(ticket.status, "called");
  assert.ok(ticket.calledAt);
  assert.equal(ticket.peopleAhead, 0);
  assert.equal(ticket.assignedStaff, staff.user.id);
  assert.equal((await act(id, "complete")).status, 409);
  assert.equal((await act(id, "recall")).status, 200);
  assert.equal((await mine(student)).data.ticket.calledAt, ticket.calledAt);
  assert.equal((await act(id, "start")).status, 200);
  ticket = (await mine(student)).data.ticket;
  assert.equal(ticket.status, "serving");
  assert.ok(ticket.startedAt);
  assert.equal((await act(id, "no_show")).status, 409);
  assert.equal((await act(id, "complete")).status, 200);
  const result = await mine(student);
  assert.equal(result.data.ticket, null);
  ticket = result.data.history[0];
  assert.equal(ticket.status, "completed");
  assert.ok(ticket.completedAt);
  assert.deepEqual(ticket.statusHistory.map((event) => event.status), ["waiting", "called", "serving", "completed"]);
  assert.equal((await act(id, "complete")).status, 409);
  const workspace = (await request("/staff/queue", staff.token)).data;
  assert.equal(workspace.current, null);
  assert.equal(workspace.completedToday, 1);
  assert.equal(workspace.history[0].studentId, "23110055");
});

test("no-show is terminal and releases the student's active ticket", async () => {
  const student = await join();
  assert.equal((await act(student.ticket._id, "no_show")).status, 409);
  await call();
  assert.equal((await act(student.ticket._id, "no_show")).status, 200);
  assert.equal((await act(student.ticket._id, "start")).status, 409);
  const result = (await mine(student)).data;
  assert.equal(result.ticket, null);
  assert.equal(result.history[0].status, "no_show");
  assert.ok(result.history[0].noShowAt);
  assert.equal((await request("/queue", student.token, "POST", { departmentId: office.id, services: ["Transcript"] })).status, 201);
});

test("students cancel only waiting tickets; staff can cancel waiting or their current visit", async () => {
  for (const stage of ["waiting", "called", "serving"]) {
    const student = await join();
    if (stage !== "waiting") await call();
    if (stage === "serving") await act(student.ticket._id, "start");
    if (stage !== "waiting") assert.equal((await request(`/queue/${student.ticket._id}/cancel`, student.token, "PATCH")).status, 409);
    assert.equal((await act(student.ticket._id, "cancel")).status, 200);
    const result = (await mine(student)).data;
    assert.equal(result.ticket, null);
    assert.equal(result.history[0].status, "cancelled");
    assert.ok(result.history[0].cancelledAt);
    assert.equal((await act(student.ticket._id, "cancel")).status, 409);
  }
  const student = await join();
  assert.equal((await request(`/queue/${student.ticket._id}/cancel`, student.token, "PATCH")).status, 200);
  assert.deepEqual((await mine(student)).data.history[0].statusHistory.map((event) => event.status), ["waiting", "cancelled"]);
});

test("enforces account role, assignment, department and visit ownership", async () => {
  const student = await join();
  assert.equal((await request("/staff/queue")).status, 401);
  for (const denied of [student, await account("admin"), await account("staff"), await account("staff", office._id, false)])
    assert.equal((await request("/staff/queue", denied.token)).status, 403);
  assert.equal((await act(student.ticket._id, "cancel", outsider)).status, 409);
  assert.equal((await request("/staff/queue", outsider.token)).data.waiting.length, 0);
  await call();
  for (const action of ["start", "complete", "no_show", "cancel", "recall"])
    assert.equal((await act(student.ticket._id, action, colleague)).status, 409);
  await User.updateOne({ _id: staff.user._id }, { department: otherOffice._id });
  assert.equal((await act(student.ticket._id, "start")).status, 409);
});

test("concurrent calls from one staff member claim exactly one FIFO ticket", async () => {
  const first = await join();
  await join();
  const results = await Promise.all(Array.from({ length: 5 }, () => call()));
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.ok(results.every((result) => [200, 409].includes(result.status)));
  const state = (await request("/staff/queue", staff.token)).data;
  assert.equal(state.current.id, first.ticket._id);
  assert.equal(state.waiting.length, 1);
});

test("different staff claim distinct FIFO tickets without stealing a visit", async () => {
  const first = await join(), second = await join();
  await join(otherOffice);
  const results = await Promise.all([call(), call(colleague)]);
  assert.ok(results.every((result) => result.status === 200));
  const states = await Promise.all([staff, colleague].map((who) => request("/staff/queue", who.token)));
  assert.deepEqual(new Set(states.map((result) => result.data.current.id)), new Set([first.ticket._id, second.ticket._id]));
  assert.equal(await Ticket.countDocuments({ department: otherOffice._id, status: "waiting" }), 1);
});

test("concurrent cancellation and call cannot resurrect or overwrite a ticket", async () => {
  const student = await join();
  const results = await Promise.all([call(), request(`/queue/${student.ticket._id}/cancel`, student.token, "PATCH")]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const ticket = await Ticket.findById(student.ticket._id).lean();
  assert.ok(["called", "cancelled"].includes(ticket.status));
  assert.equal(ticket.statusHistory.length, 2);
});

test("paused or closed offices prevent new calls but allow a current visit to finish", async () => {
  const student = await join();
  await call();
  await join();
  assert.equal((await request("/staff/queue/pause", staff.token, "PATCH", { paused: true })).status, 200);
  assert.equal((await call(colleague)).status, 409);
  assert.equal((await act(student.ticket._id, "start")).status, 200);
  assert.equal((await act(student.ticket._id, "complete")).status, 200);
  await request("/staff/queue/pause", staff.token, "PATCH", { paused: false });
  await Queue.updateOne({ department: office._id }, { isOpen: false });
  assert.equal((await call()).status, 409);
  await Queue.updateOne({ department: office._id }, { isOpen: true });
  await Department.updateOne({ _id: office._id }, { isActive: false });
  assert.equal((await call()).status, 409);
});

test("rejects malformed and unknown actions without changing the ticket", async () => {
  const student = await join();
  assert.equal((await act("bad-id", "start")).status, 400);
  assert.equal((await act(student.ticket._id, "constructor")).status, 400);
  assert.equal((await request("/staff/queue/pause", staff.token, "PATCH", { paused: "true" })).status, 400);
  assert.equal((await mine(student)).data.ticket.status, "waiting");
});

async function scheduledFor(student, department = office) {
  const now = Date.now();
  const startsAt = new Date(Math.ceil((now + 4 * 60000) / 60000) * 60000);
  const endsAt = new Date(startsAt.getTime() + 20 * 60000);
  return Appointment.create({
    student: student.user._id, department: department._id, departmentName: department.name,
    location: "Campus office", services: [{ name: "Transcript", estimatedDuration: 20 }],
    estimatedServiceTime: 20, startsAt, endsAt, reservedMinutes: reservedMinutes(startsAt, endsAt),
    notes: "Booked visit",
  });
}

test("an appointment enters the office queue five minutes early exactly once and follows staff actions", async () => {
  const owner = await account("student");
  const appointment = await scheduledFor(owner);
  const far = new Date(appointment.startsAt.getTime() - 5 * 60000 - 1000);
  assert.equal(await admitDueAppointments({ now: far }), 0);
  assert.equal(await Ticket.countDocuments({ appointment: appointment._id }), 0);
  const results = await Promise.all(Array.from({ length: 5 }, () => admitDueAppointments({ now: new Date() })));
  assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
  assert.equal(await Ticket.countDocuments({ appointment: appointment._id }), 1);
  const waiting = (await request("/staff/queue", staff.token)).data.waiting;
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].appointmentReference, `APT-${appointment._id}`);
  assert.equal(waiting[0].appointmentStartsAt, appointment.startsAt.getTime());
  const mineBefore = (await request("/queue/mine", owner.token)).data.ticket;
  assert.equal(mineBefore.appointmentReference, `APT-${appointment._id}`);
  assert.equal((await request("/appointments", owner.token)).data.appointments[0].serviceStatus, "waiting");
  assert.equal((await call()).status, 200);
  assert.equal((await request("/appointments", owner.token)).data.appointments[0].serviceStatus, "called");
  assert.equal((await act(mineBefore._id, "start")).status, 200);
  assert.equal((await act(mineBefore._id, "complete")).status, 200);
  assert.equal((await request("/appointments", owner.token)).data.appointments[0].serviceStatus, "completed");
  assert.equal((await request("/queue/mine", owner.token)).data.history[0].appointmentReference, `APT-${appointment._id}`);
  assert.equal(await admitDueAppointments({ now: new Date() }), 0);
});

test("student cancellation releases an admitted appointment and cannot affect another student", async () => {
  const owner = await account("student"), stranger = await account("student");
  const appointment = await scheduledFor(owner);
  await admitDueAppointments();
  assert.equal((await request(`/appointments/${appointment._id}/cancel`, stranger.token, "PATCH")).status, 409);
  assert.equal((await Ticket.findOne({ appointment: appointment._id })).status, "waiting");
  assert.equal((await request(`/appointments/${appointment._id}/cancel`, owner.token, "PATCH")).status, 200);
  assert.equal((await Ticket.findOne({ appointment: appointment._id })).status, "cancelled");
  assert.equal((await Appointment.findById(appointment._id)).status, "cancelled");
  assert.equal((await request("/staff/queue", staff.token)).data.waiting.length, 0);
  assert.equal(await admitDueAppointments(), 0);
});

test("a called appointment cannot be cancelled by the student; staff may finish or cancel it", async () => {
  const owner = await account("student");
  const appointment = await scheduledFor(owner);
  await admitDueAppointments();
  const id = (await Ticket.findOne({ appointment: appointment._id }))._id;
  assert.equal((await request(`/queue/${id}/cancel`, owner.token, "PATCH")).status, 409);
  await call();
  assert.equal((await request(`/appointments/${appointment._id}/cancel`, owner.token, "PATCH")).status, 409);
  assert.equal((await act(id, "cancel")).status, 200);
  assert.equal((await Appointment.findById(appointment._id)).status, "cancelled");
});

test("staff can mark an appointment no-show and the student sees that result", async () => {
  const owner = await account("student");
  const appointment = await scheduledFor(owner);
  await admitDueAppointments();
  const ticket = await Ticket.findOne({ appointment: appointment._id });
  assert.equal((await call()).status, 200);
  assert.equal((await act(ticket._id, "no_show")).status, 200);
  const mine = (await request("/appointments", owner.token)).data.appointments[0];
  assert.equal(mine.serviceStatus, "no_show");
  assert.equal(mine.queueReference, `Q-${String(ticket.number).padStart(3, "0")}`);
  assert.equal((await request("/queue/mine", owner.token)).data.history[0].status, "no_show");
});

test("concurrent admission and cancellation cannot leave a cancelled appointment waiting", async () => {
  const owner = await account("student");
  const appointment = await scheduledFor(owner);
  const [, cancellation] = await Promise.all([
    admitDueAppointments(),
    request(`/appointments/${appointment._id}/cancel`, owner.token, "PATCH"),
  ]);
  assert.equal(cancellation.status, 200);
  await admitDueAppointments();
  assert.equal((await Appointment.findById(appointment._id)).status, "cancelled");
  assert.equal(await Ticket.countDocuments({ appointment: appointment._id, status: "waiting" }), 0);
});

test("an active walk-in ticket delays appointment admission until the ticket is released", async () => {
  const owner = await account("student");
  const walkIn = await request("/queue", owner.token, "POST", { departmentId: otherOffice.id, services: ["Transcript"] });
  assert.equal(walkIn.status, 201);
  const appointment = await scheduledFor(owner);
  assert.equal(await admitDueAppointments(), 0);
  assert.equal(await Ticket.countDocuments({ appointment: appointment._id }), 0);
  assert.equal((await request("/appointments", owner.token)).data.appointments[0].queueAdmissionBlocked, true);
  assert.equal((await request(`/queue/${walkIn.data.ticket._id}/cancel`, owner.token, "PATCH")).status, 200);
  assert.equal(await admitDueAppointments(), 1);
  assert.equal((await request("/queue/mine", owner.token)).data.ticket.appointmentReference, `APT-${appointment._id}`);
});
