const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const User = require("../models/User");
const Ticket = require("../models/QueueTicket");
const Sequence = require("../models/QueueSequence");

const databaseName = `smartqueue_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
let server, base, department, otherDepartment;
process.env.JWT_SECRET = randomUUID();

async function student(role = "student", isActive = true) {
  const user = await User.create({
    fullName: "Test Student",
    email: `${randomUUID()}@example.test`,
    password: "unused-test-hash",
    role,
    isActive,
  });
  return {
    user,
    token: jwt.sign({ id: user._id.toString(), role }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    }),
  };
}
async function request(path, token, method = "GET", body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const booking = (id = department._id.toString()) => ({
  departmentId: id,
  services: ["Transcript", "Verification"],
  notes: "Two requests",
});

before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI ||
      process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/smart_queue",
    { dbName: databaseName, serverSelectionTimeoutMS: 10000 },
  );
  await Promise.all([Ticket.init(), User.init(), Sequence.init()]);
  const services = [
    { name: "Transcript", estimatedDuration: 10 },
    { name: "Verification", estimatedDuration: 8 },
    { name: "Unknown", estimatedDuration: 0 },
  ];
  [department, otherDepartment] = await Department.create([
    { name: "Test Registrar", services },
    { name: "Test Finance", services },
  ]);
  await Queue.create([
    { department: department._id, isOpen: true },
    { department: otherDepartment._id, isOpen: true },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/queue", require("../routes/queueRoutes"));
  app.use("/departments", require("../routes/departmentRoutes"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (
      mongoose.connection.readyState === 1 &&
      mongoose.connection.name === databaseName &&
      databaseName.startsWith("smartqueue_test_")
    ) {
      await mongoose.connection.dropDatabase();
    }
  } finally {
    await mongoose.disconnect();
  }
});

test("requires a valid active student account", async () => {
  assert.equal((await request("/queue/mine")).status, 401);
  assert.equal((await request("/queue/mine", "forged")).status, 401);
  for (const fixture of [
    await student("staff"),
    await student("student", false),
  ]) {
    assert.equal((await request("/queue/mine", fixture.token)).status, 403);
  }
});

test("loads service durations and never substitutes service time for wait", async () => {
  const result = await request(`/departments/${department._id}`);
  assert.equal(result.status, 200);
  assert.equal(result.data.department.serviceDetails[0].estimatedDuration, 10);
  assert.equal(result.data.department.estimatedWait, null);
  assert.equal(result.data.department.activeCounters, null);
});

test("creates a multi-service ticket, reloads it, and blocks another department", async () => {
  const { token } = await student();
  const result = await request("/queue", token, "POST", {
    ...booking(),
    estimatedServiceTime: 1,
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.ticket.estimatedServiceTime, 18);
  assert.equal(result.data.ticket.services.length, 2);
  assert.equal(result.data.ticket.status, "waiting");
  const reloaded = await request("/queue/mine", token);
  assert.equal(reloaded.data.ticket._id, result.data.ticket._id);
  assert.equal(
    (
      await request(
        "/queue",
        token,
        "POST",
        booking(otherDepartment._id.toString()),
      )
    ).status,
    409,
  );
});

test("validates services, duplicates, notes, and department IDs", async () => {
  const { token } = await student();
  for (const invalid of [
    { ...booking(), services: [] },
    { ...booking(), services: ["Missing"] },
    { ...booking(), services: ["Transcript", "Transcript"] },
    { ...booking(), notes: "x".repeat(1001) },
    { ...booking(), departmentId: "invalid" },
  ])
    assert.equal((await request("/queue", token, "POST", invalid)).status, 400);
  assert.equal((await request("/queue/mine", token)).data.ticket, null);
});

test("rechecks paused, closed, and disabled departments when joining", async () => {
  const { token } = await student();
  for (const state of [
    { isPaused: true, isOpen: true },
    { isPaused: false, isOpen: false },
  ]) {
    await Queue.updateOne({ department: otherDepartment._id }, state);
    assert.equal(
      (
        await request(
          "/queue",
          token,
          "POST",
          booking(otherDepartment._id.toString()),
        )
      ).status,
      409,
    );
  }
  await Queue.updateOne({ department: otherDepartment._id }, { isOpen: true });
  await Department.updateOne({ _id: otherDepartment._id }, { isActive: false });
  assert.equal(
    (
      await request(
        "/queue",
        token,
        "POST",
        booking(otherDepartment._id.toString()),
      )
    ).status,
    409,
  );
  await Department.updateOne({ _id: otherDepartment._id }, { isActive: true });
});

test("unknown service durations stay unknown", async () => {
  const { token } = await student();
  const result = await request("/queue", token, "POST", {
    ...booking(),
    services: ["Transcript", "Unknown"],
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.ticket.estimatedServiceTime, null);
});

test("simultaneous submissions create only one active ticket per student", async () => {
  const { token, user } = await student();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      request("/queue", token, "POST", booking()),
    ),
  );
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.ok(results.every((result) => [201, 409].includes(result.status)));
  assert.equal(await Ticket.countDocuments({ student: user._id }), 1);
});

test("concurrent different students get unique ticket numbers", async () => {
  const fixtures = await Promise.all(
    Array.from({ length: 5 }, () => student()),
  );
  const results = await Promise.all(
    fixtures.map(({ token }, index) =>
      request(
        "/queue",
        token,
        "POST",
        booking(
          index % 2
            ? otherDepartment._id.toString().toUpperCase()
            : otherDepartment._id.toString(),
        ),
      ),
    ),
  );
  assert.ok(results.every((result) => result.status === 201));
  assert.equal(
    new Set(results.map((result) => result.data.ticket.reference)).size,
    5,
  );
});

test("another student cannot see or cancel a ticket; owner can cancel and rejoin", async () => {
  const owner = await student(),
    other = await student();
  const created = await request("/queue", owner.token, "POST", booking());
  const path = `/queue/${created.data.ticket._id}/cancel`;
  assert.equal((await request("/queue/mine", other.token)).data.ticket, null);
  assert.equal((await request(path, other.token, "PATCH")).status, 409);
  assert.equal((await request(path, owner.token, "PATCH")).status, 200);
  const mine = await request("/queue/mine", owner.token);
  assert.equal(mine.data.ticket, null);
  assert.equal(mine.data.history[0].status, "cancelled");
  assert.equal(
    (await request("/queue", owner.token, "POST", booking())).status,
    201,
  );
});

test("called tickets remain active and cannot be cancelled by the student", async () => {
  const { token } = await student();
  const created = await request("/queue", token, "POST", booking());
  await Ticket.updateOne(
    { _id: created.data.ticket._id },
    { status: "called" },
  );
  assert.equal(
    (await request(`/queue/${created.data.ticket._id}/cancel`, token, "PATCH"))
      .status,
    409,
  );
  assert.equal((await request("/queue", token, "POST", booking())).status, 409);
  await Ticket.updateOne(
    { _id: created.data.ticket._id },
    { status: "completed" },
  );
  assert.equal((await request("/queue", token, "POST", booking())).status, 201);
});

test("people ahead and department waiting count reflect saved tickets", async () => {
  const { token } = await student();
  const count = await Ticket.countDocuments({
    department: department._id,
    status: { $in: ["waiting", "called", "serving"] },
  });
  const result = await request("/queue", token, "POST", booking());
  assert.equal(result.data.ticket.peopleAhead, count);
  const departmentResult = await request(`/departments/${department._id}`);
  assert.equal(
    departmentResult.data.department.waitingCount,
    await Ticket.countDocuments({
      department: department._id,
      status: "waiting",
    }),
  );
});
