const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const Department = require("../models/Department");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const databaseName = `smartqueue_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
process.env.JWT_SECRET = randomUUID();
let server, base, department, otherDepartment, date;

async function student(role = "student", isActive = true) {
  const user = await User.create({ fullName: "Test Student", email: `${randomUUID()}@example.test`, password: "unused", role, isActive });
  return { user, token: jwt.sign({ id: String(user._id), role }, process.env.JWT_SECRET, { expiresIn: "10m" }) };
}
async function request(path, token, method = "GET", body) {
  const result = await fetch(`${base}${path}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: result.status, data: await result.json() };
}
function booking(time = "07:30", id = department._id) {
  return { departmentId: String(id), services: ["Transcript", "Verification"], date, startsAt: `${date}T${time}:00+07:00`, notes: "Two services" };
}
function availability(payload = booking()) {
  const query = new URLSearchParams({ departmentId: payload.departmentId, date: payload.date });
  payload.services.forEach((name) => query.append("services", name));
  return `/appointments/availability?${query}`;
}

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", {
    dbName: databaseName, serverSelectionTimeoutMS: 10000,
  });
  await Promise.all([User.init(), Appointment.init()]);
  const services = [{ name: "Transcript", estimatedDuration: 10 }, { name: "Verification", estimatedDuration: 15 }, { name: "Unknown", estimatedDuration: 0 }];
  [department, otherDepartment] = await Department.create([{ name: "Registrar", services }, { name: "Finance", services }]);
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 2);
  while ([0, 6].includes(future.getUTCDay())) future.setUTCDate(future.getUTCDate() + 1);
  date = future.toISOString().slice(0, 10);
  const app = express();
  app.use(express.json());
  app.use("/appointments", require("../routes/appointmentRoutes"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => { await Appointment.deleteMany({}); });
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("smartqueue_test_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

test("only active authenticated students can use appointments", async () => {
  assert.equal((await request("/appointments")).status, 401);
  assert.equal((await request("/appointments", "forged")).status, 401);
  for (const fixture of [await student("staff"), await student("student", false)]) {
    assert.equal((await request("/appointments", fixture.token)).status, 403);
  }
});

test("books and reloads multiple services using server durations", async () => {
  const { token } = await student();
  const slots = await request(availability(), token);
  assert.equal(slots.status, 200);
  const first = slots.data.slots[0];
  assert.equal((Date.parse(first.endsAt) - Date.parse(first.startsAt)) / 60000, 25);
  const created = await request("/appointments", token, "POST", { ...booking(), estimatedServiceTime: 1, endsAt: booking().startsAt });
  assert.equal(created.status, 201);
  assert.equal(created.data.appointment.estimatedServiceTime, 25);
  assert.equal(created.data.appointment.services.length, 2);
  assert.equal(created.data.appointment.endsAt, first.endsAt);
  assert.equal(created.data.appointment.reservedMinutes, undefined);
  const mine = await request("/appointments", token);
  assert.equal(mine.data.appointments[0]._id, created.data.appointment._id);
});

test("validates selections, unknown durations, dates, notes and time alignment", async () => {
  const { token } = await student();
  for (const change of [
    { services: [] }, { services: "Transcript" }, { services: ["Transcript", "Transcript"] },
    { services: ["Missing"] }, { services: ["Unknown"] }, { services: [null] },
    { departmentId: "invalid" }, { date: "2026-02-30" }, { date: "2000-01-01" },
    { date: "2999-01-01" }, { notes: "x".repeat(1001) },
  ]) assert.equal((await request("/appointments", token, "POST", { ...booking(), ...change })).status, 400, JSON.stringify(change));
  for (const time of ["07:31", "11:15", "12:00", "16:15"]) {
    assert.equal((await request("/appointments", token, "POST", booking(time))).status, 409, time);
  }
  assert.equal((await request("/appointments", token, "POST", { ...booking(), startsAt: "invalid" })).status, 409);
  assert.equal(await Appointment.countDocuments(), 0);
});

test("one service works and selection changes availability near closing time", async () => {
  const { token } = await student();
  const single = { ...booking("11:15"), services: ["Transcript"] };
  const times = await request(availability(single), token);
  assert.ok(times.data.slots.some((slot) => Date.parse(slot.startsAt) === Date.parse(single.startsAt)));
  const multi = await request(availability(), token);
  assert.ok(!multi.data.slots.some((slot) => Date.parse(slot.startsAt) === Date.parse(single.startsAt)));
  assert.equal((await request("/appointments", token, "POST", single)).status, 201);
});

test("concurrent overlapping starts in a department cannot double book", async () => {
  const fixtures = await Promise.all([student(), student(), student(), student()]);
  const results = await Promise.all(fixtures.map(({ token }, index) => request("/appointments", token, "POST", booking(index % 2 ? "07:45" : "07:30"))));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.ok(results.every((result) => [201, 409].includes(result.status)));
  assert.equal(await Appointment.countDocuments(), 1);
  const slots = await request(availability(), fixtures[0].token);
  assert.equal(slots.data.slots[0].available, false);
});

test("student cannot book overlapping appointments across departments", async () => {
  const { token } = await student();
  const results = await Promise.all([
    request("/appointments", token, "POST", booking()),
    request("/appointments", token, "POST", booking("07:45", otherDepartment._id)),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const slots = await request(availability(booking("07:30", otherDepartment._id)), token);
  assert.equal(slots.data.slots[0].available, false);
});

test("adjacent visits are allowed and cancellation atomically releases the whole interval", async () => {
  const owner = await student(), other = await student();
  const first = await request("/appointments", owner.token, "POST", { ...booking(), services: ["Verification"] });
  assert.equal(first.status, 201);
  assert.equal((await request("/appointments", other.token, "POST", booking("07:45"))).status, 201);
  assert.equal((await request("/appointments", other.token)).data.appointments.length, 1);
  const path = `/appointments/${first.data.appointment._id}/cancel`;
  assert.equal((await request(path, other.token, "PATCH")).status, 409);
  assert.equal((await request(path, owner.token, "PATCH")).status, 200);
  assert.equal((await request(path, owner.token, "PATCH")).status, 409);
  assert.equal((await request("/appointments", owner.token, "POST", { ...booking(), services: ["Verification"] })).status, 201);
  const mine = await request("/appointments", owner.token);
  assert.equal(mine.data.appointments.filter((item) => item.status === "cancelled").length, 1);
});

test("rechecks department booking rules and services on submission", async () => {
  const { token } = await student();
  for (const change of [{ bookingEnabled: false }, { isActive: false }, { bookingExcludedDates: [date] }, { bookingWeekdays: [] }]) {
    await Department.updateOne({ _id: department._id }, change);
    assert.equal((await request("/appointments", token, "POST", booking())).status, 409);
    await Department.updateOne({ _id: department._id }, { bookingEnabled: true, isActive: true, bookingExcludedDates: [], bookingWeekdays: [1, 2, 3, 4, 5] });
  }
  await Department.updateOne({ _id: department._id }, { "services.0.estimatedDuration": 0 });
  assert.equal((await request("/appointments", token, "POST", booking())).status, 400);
  await Department.updateOne({ _id: department._id }, { "services.0.estimatedDuration": 10 });
});
