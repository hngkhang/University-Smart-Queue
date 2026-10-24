const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config({ quiet: true });
const User = require("../models/User");
const Department = require("../models/Department");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");

const databaseName = `sq_users_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
process.env.JWT_SECRET = randomUUID();
let server, base, admin, student, staff, office, inactive, archived;
const password = "Initial-password-123";
const token = (user) => jwt.sign({ id: String(user._id), role: user.role, sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET);
const profile = (overrides = {}) => ({ fullName: "New Student", email: `${randomUUID()}@example.test`, role: "student", studentID: "S100", phone: "+84 901 234 567", ...overrides });
async function request(path, auth = token(admin), method = "GET", body) {
  const response = await fetch(base + path, { method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const stored = (id) => User.findById(id).select("+sessionVersion +password +passwordRequests").lean();
const version = (user) => new Date(user.updatedAt).toISOString();
const updateBody = (user, overrides = {}) => ({ ...profile(user), department: user.department?.toString(), updatedAt: version(user), ...overrides });
function safeAccount(account) {
  for (const field of ["password", "passwordRequests", "sessionVersion", "lastPasswordRequestAt", "__v"]) assert.equal(field in account, false, field);
}

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Ticket.init(), Appointment.init()]);
  [office, inactive, archived] = await Department.create([
    { name: "Academic Services" }, { name: "Inactive Office", isActive: false }, { name: "Archived Office", isArchived: true },
  ]);
  const hash = await bcrypt.hash(password, 4);
  [admin, student, staff] = await User.create([
    { ...profile(), email: "admin@example.test", role: "admin", password: hash },
    { ...profile(), email: "student@example.test", password: hash },
    { ...profile(), email: "staff@example.test", role: "staff", department: office._id, password: hash },
  ]);
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminRoutes"));
  app.use("/auth", require("../routes/authRoutes"));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("sq_users_test_")) await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

test("all account operations require an active admin; admin accounts cannot be changed", async () => {
  for (const [path, method, body] of [
    ["/admin/users", "GET"], ["/admin/users", "POST", profile()],
    [`/admin/users/${student._id}`, "PUT", updateBody(student)],
    [`/admin/users/${student._id}/status`, "PATCH", { isActive: false, updatedAt: version(student) }],
  ]) {
    assert.equal((await request(path, null, method, body)).status, 401);
    for (const actor of [student, staff]) assert.equal((await request(path, token(actor), method, body)).status, 403);
  }
  assert.equal((await request(`/admin/users/${admin._id}`, undefined, "PUT", updateBody(admin, { role: "student" }))).status, 404);
  assert.equal((await request(`/admin/users/${admin._id}/status`, undefined, "PATCH", { isActive: false, updatedAt: version(admin) })).status, 404);
});

test("create normalizes email, hashes the password, protects server fields and supports login", async () => {
  const result = await request("/admin/users", undefined, "POST", {
    ...profile({ email: "  CREATED@Example.Test  " }), password, confirmation: password,
    isActive: false, sessionVersion: 900, passwordRequests: [{ status: "completed" }],
  });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  const account = result.data.account;
  safeAccount(account);
  assert.equal(account.email, "created@example.test");
  assert.equal(account.isActive, true);
  const record = await stored(account._id);
  assert.notEqual(record.password, password);
  assert.ok(await bcrypt.compare(password, record.password));
  assert.equal(record.sessionVersion, 0);
  assert.equal(record.passwordRequests.length, 0);
  assert.equal((await request("/auth/login", null, "POST", { email: account.email, password, role: "student" })).status, 200);
  assert.equal((await request("/admin/users", undefined, "POST", { ...profile({ email: "CREATED@example.test" }), password, confirmation: password })).status, 409);
});

test("create validates roles, input types, passwords and department availability", async () => {
  const valid = { ...profile(), password, confirmation: password };
  for (const change of [
    { role: "admin" }, { role: { $ne: "student" } }, { fullName: " " }, { email: "invalid" },
    { studentID: "" }, { phone: "invalid phone" }, { fullName: "x".repeat(121) },
    { password: "short", confirmation: "short" }, { confirmation: "different" },
    { password: "界".repeat(25), confirmation: "界".repeat(25) },
    { role: "staff", department: null }, { role: "staff", department: "invalid" },
    ...[inactive._id, archived._id, new mongoose.Types.ObjectId()].map((id) => ({ role: "staff", department: String(id) })),
  ]) assert.equal((await request("/admin/users", undefined, "POST", { ...valid, ...change })).status, 400, JSON.stringify(change));
  const result = await request("/admin/users", undefined, "POST", { ...valid, role: "staff", department: String(office._id) });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.account.department.name, office.name);
  assert.equal(result.data.account.studentID, "");
});

test("lists paginate, filter and escape search text without revealing secrets or administrators", async () => {
  await User.create(Array.from({ length: 14 }, (_, index) => ({ ...profile({ fullName: `Paged Person ${String(index).padStart(2, "0")}`, studentID: `PAGE${index}` }), password: "unused", isActive: index % 2 === 0 })));
  const first = await request("/admin/users?search=Paged&role=student&page=1");
  const second = await request("/admin/users?search=Paged&role=student&page=2");
  assert.equal(first.data.total, 14);
  assert.equal(first.data.items.length, 12);
  assert.equal(second.data.items.length, 2);
  assert.equal(new Set([...first.data.items, ...second.data.items].map((user) => user._id)).size, 14);
  first.data.items.forEach(safeAccount);
  assert.equal((await request("/admin/users?search=Paged&status=disabled")).data.total, 7);
  assert.equal((await request("/admin/users?search=Paged&status=active")).data.total, 7);
  assert.equal((await request("/admin/users?search=PAGE13")).data.total, 1);
  assert.equal((await request("/admin/users?search=%5B.*")).data.total, 0);
  assert.equal((await request("/admin/users?search=admin@example.test")).data.total, 0);
});

test("profile edits revoke sessions, preserve passwords and reject stale or duplicate updates", async () => {
  const current = await stored(student._id);
  const originalToken = token(current);
  const body = updateBody(current, { fullName: "Updated Student", password: "injected-password", isActive: false, sessionVersion: 500 });
  const result = await request(`/admin/users/${student._id}`, undefined, "PUT", body);
  assert.equal(result.status, 200, JSON.stringify(result.data));
  safeAccount(result.data.account);
  const changed = await stored(student._id);
  assert.equal(changed.fullName, "Updated Student");
  assert.equal(changed.password, current.password);
  assert.equal(changed.isActive, true);
  assert.equal(changed.sessionVersion, current.sessionVersion + 1);
  assert.equal((await request("/auth/session", originalToken)).status, 401);
  assert.equal((await request(`/admin/users/${student._id}`, undefined, "PUT", body)).status, 409);
  assert.equal((await request(`/admin/users/${student._id}`, undefined, "PUT", updateBody(changed, { email: staff.email }))).status, 409);
  assert.equal((await request(`/admin/users/${student._id}`, undefined, "PUT", updateBody(changed, { role: "admin" }))).status, 400);
});

test("disable and re-enable preserve recovery history and never resurrect old sessions", async () => {
  const person = await User.create({ ...profile(), password: await bcrypt.hash(password, 4), passwordRequests: [{ note: "Help" }] });
  const oldToken = token(person);
  const path = `/admin/users/${person._id}/status`;
  const disabled = await request(path, undefined, "PATCH", { updatedAt: version(person), isActive: false });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
  safeAccount(disabled.data.account);
  assert.equal((await request("/auth/session", oldToken)).status, 401);
  assert.equal((await request("/auth/login", null, "POST", { email: person.email, password })).status, 403);
  assert.equal((await request(path, undefined, "PATCH", { updatedAt: version(person), isActive: true })).status, 409);
  const enabled = await request(path, undefined, "PATCH", { updatedAt: disabled.data.account.updatedAt, isActive: true });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.data));
  assert.equal((await request("/auth/session", oldToken)).status, 401);
  assert.equal((await stored(person._id)).passwordRequests.length, 1);
  assert.equal((await request("/auth/login", null, "POST", { email: person.email, password })).status, 200);
});

test("role and department changes preserve history and cannot strand a current staff visit", async () => {
  const current = await stored(staff._id);
  const ticket = await Ticket.create({ student: student._id, department: office._id, departmentName: office.name, serviceDate: "2026-10-21", number: 1, status: "serving", assignedStaff: staff._id });
  assert.equal((await request(`/admin/users/${staff._id}/status`, undefined, "PATCH", { updatedAt: version(current), isActive: false })).status, 409);
  assert.equal((await request(`/admin/users/${staff._id}`, undefined, "PUT", updateBody(current, { role: "student", studentID: "STAFF2STUDENT" }))).status, 409);
  const otherOffice = await Department.create({ name: "Other Office" });
  assert.equal((await request(`/admin/users/${staff._id}`, undefined, "PUT", updateBody(current, { department: String(otherOffice._id) }))).status, 409);
  const studentCurrent = await stored(student._id);
  assert.equal((await request(`/admin/users/${student._id}`, undefined, "PUT", updateBody(studentCurrent, { role: "staff", department: String(office._id) }))).status, 409);
  await Ticket.updateOne({ _id: ticket._id }, { $set: { status: "completed" } });
  const moved = await request(`/admin/users/${staff._id}`, undefined, "PUT", updateBody(current, { department: String(otherOffice._id) }));
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  assert.equal(moved.data.account.department._id, String(otherOffice._id));
  const changed = await request(`/admin/users/${staff._id}`, undefined, "PUT", { ...updateBody(await stored(staff._id)), role: "student", studentID: "NEWSTUDENT" });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.account.department, null);
  assert.equal((await Ticket.findById(ticket._id)).assignedStaff.toString(), String(staff._id));
});

test("invalid IDs, missing versions, non-boolean status and missing users return client errors", async () => {
  assert.equal((await request("/admin/users/invalid", undefined, "PUT", profile())).status, 400);
  assert.equal((await request(`/admin/users/${student._id}`, undefined, "PUT", profile())).status, 400);
  assert.equal((await request(`/admin/users/${student._id}/status`, undefined, "PATCH", { updatedAt: version(student), isActive: "false" })).status, 400);
  assert.equal((await request(`/admin/users/${new mongoose.Types.ObjectId()}`, undefined, "PUT", { ...profile(), updatedAt: version(student) })).status, 404);
});

test("concurrent edits allow one winner and concurrent creates enforce unique emails", async () => {
  const user = await User.create({ ...profile(), password: "unused" });
  const edits = await Promise.all(["First edit", "Second edit"].map((fullName) =>
    request(`/admin/users/${user._id}`, undefined, "PUT", updateBody(user, { fullName }))));
  assert.deepEqual(edits.map((result) => result.status).sort(), [200, 409]);
  const input = { ...profile(), password, confirmation: password };
  const creates = await Promise.all([request("/admin/users", undefined, "POST", input), request("/admin/users", undefined, "POST", input)]);
  assert.deepEqual(creates.map((result) => result.status).sort(), [201, 409]);
  assert.equal(await User.countDocuments({ email: input.email }), 1);
});

test("upcoming appointments prevent student role changes until resolved", async () => {
  const user = await User.create({ ...profile(), password: "unused" });
  const appointment = await Appointment.create({ student: user._id, department: office._id,
    departmentName: office.name, location: "A1", services: [{ name: "Support", estimatedDuration: 15 }],
    estimatedServiceTime: 15, startsAt: new Date(Date.now() + 60000), endsAt: new Date(Date.now() + 960000),
    reservedMinutes: [Math.floor(Date.now() / 60000) + 1],
  });
  const body = updateBody(user, { role: "staff", department: String(office._id) });
  assert.equal((await request(`/admin/users/${user._id}`, undefined, "PUT", body)).status, 409);
  await Appointment.updateOne({ _id: appointment._id }, { $set: { status: "cancelled" } });
  assert.equal((await request(`/admin/users/${user._id}`, undefined, "PUT", body)).status, 200);
});

test("legacy imported accounts without timestamps can be edited once using their returned null version", async () => {
  const user = { ...profile({ email: "legacy@example.test" }), password: "unused" };
  const { insertedId } = await User.collection.insertOne(user);
  const list = await request("/admin/users?search=legacy@example.test");
  assert.equal(list.data.items[0].updatedAt, null);
  assert.equal(list.data.items[0].isActive, true);
  const body = { ...user, updatedAt: null, fullName: "Legacy Updated" };
  const updated = await request(`/admin/users/${insertedId}`, undefined, "PUT", body);
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.ok(updated.data.account.updatedAt);
  assert.equal((await request(`/admin/users/${insertedId}`, undefined, "PUT", body)).status, 409);
});
