const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config({ quiet: true });
const User = require("../models/User");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const Appointment = require("../models/Appointment");

const databaseName = `sq_dept_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
process.env.JWT_SECRET = randomUUID();
let server, base, adminToken, studentToken;
const payload = {
  name: "Academic Services", vietnameseName: "Dịch vụ học vụ",
  description: "Student support", location: "A1-101",
  workingHours: "07:30 - 11:30 | 13:00 - 16:30",
  isActive: true, bookingEnabled: true, bookingWeekdays: [1, 2, 3, 4, 5],
  bookingExcludedDates: [], services: [{ name: "Consultation", estimatedDuration: 15 }],
};
async function request(path, auth, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  await mongoose.connect(process.env.TEST_MONGODB_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue",
    { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  const [admin, student] = await User.create([
    { fullName: "Admin", email: "admin@example.test", role: "admin", password: "unused" },
    { fullName: "Student", email: "student@example.test", role: "student", password: "unused" },
  ]);
  adminToken = jwt.sign({ id: String(admin._id), sessionVersion: 0 }, process.env.JWT_SECRET);
  studentToken = jwt.sign({ id: String(student._id), sessionVersion: 0 }, process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminRoutes"));
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  try {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === databaseName && databaseName.startsWith("sq_dept_test_"))
      await mongoose.connection.dropDatabase();
  } finally { await mongoose.disconnect(); }
});

test("only admins can manage departments", async () => {
  for (const method of ["GET", "POST"]) {
    assert.equal((await request("/admin/departments", null, method, method === "POST" ? payload : undefined)).status, 401);
    assert.equal((await request("/admin/departments", studentToken, method, method === "POST" ? payload : undefined)).status, 403);
  }
});

test("create, validate, update and archive a department", async () => {
  assert.equal((await request("/admin/departments", adminToken, "POST", { ...payload, workingHours: "invalid" })).status, 400);
  const created = await request("/admin/departments", adminToken, "POST", payload);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.department.id;
  assert.equal((await request("/admin/departments", adminToken, "POST", { ...payload, name: "academic services" })).status, 409);
  assert.equal((await request("/admin/departments", adminToken)).data.departments.length, 1);
  await Queue.create({ department: id, isOpen: true });
  const updated = await request(`/admin/departments/${id}`, adminToken, "PUT", { ...payload, name: "Student Services", isActive: false });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.department.name, "Student Services");
  assert.equal((await Queue.findOne({ department: id }).lean()).isOpen, false);
  const deleted = await request(`/admin/departments/${id}`, adminToken, "DELETE");
  assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
  assert.equal((await request("/admin/departments", adminToken)).data.departments.length, 0);
  assert.equal((await Department.findById(id).lean()).isArchived, true);
  assert.equal((await request(`/admin/departments/${id}`, adminToken, "PUT", payload)).status, 404);
});

test("future appointments prevent department deletion", async () => {
  const created = await request("/admin/departments", adminToken, "POST", { ...payload, name: "Scheduled Office" });
  const id = created.data.department.id;
  const student = await User.findOne({ role: "student" }).lean();
  const startsAt = new Date(Date.now() + 86400000);
  const endsAt = new Date(startsAt.getTime() + 15 * 60000);
  await Appointment.create({ student: student._id, department: id, departmentName: "Scheduled Office",
    location: "A1-101", services: [{ name: "Consultation", estimatedDuration: 15 }],
    estimatedServiceTime: 15, startsAt, endsAt, reservedMinutes: [startsAt.getTime() / 60000] });
  assert.equal((await request(`/admin/departments/${id}`, adminToken, "DELETE")).status, 409);
  assert.equal((await request(`/admin/departments/${id}`, adminToken, "PUT", { ...payload, name: "Scheduled Office", isActive: false })).status, 409);
  assert.equal((await Department.findById(id).lean()).isArchived, false);
});

test("service descriptions survive editing and reject malformed values", async () => {
  const services = [{ ...payload.services[0], description: "  Tư vấn học vụ, không sửa thông tin hóa đơn.  " }];
  const created = await request("/admin/departments", adminToken, "POST", { ...payload, name: "Described Office", services });
  assert.equal(created.status, 201);
  assert.equal(created.data.department.services[0].description, services[0].description.trim());
  const id = created.data.department.id;
  const updated = await request(`/admin/departments/${id}`, adminToken, "PUT", { ...payload, name: "Described Office", services: created.data.department.services });
  assert.equal(updated.status, 200);
  assert.equal((await Department.findById(id).lean()).services[0].description, services[0].description.trim());
  for (const description of [null, 123, "x".repeat(1001)]) {
    assert.equal((await request(`/admin/departments/${id}`, adminToken, "PUT", { ...payload, services: [{ ...payload.services[0], description }] })).status, 400);
  }
});
