const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config({ quiet: true });
const User = require("../models/User");

const databaseName = `smartqueue_admin_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
let server, base, admin, student, staff, disabled, oldToken;
const originalPassword = "Original-example-123";
const newPassword = "Replacement-example-456";
process.env.JWT_SECRET = randomUUID();
const token = (user, version = 0) =>
  jwt.sign(
    { id: user._id.toString(), role: user.role, sessionVersion: version },
    process.env.JWT_SECRET,
    { expiresIn: "10m" },
  );
async function request(path, auth, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
async function record(user) {
  return User.findById(user._id)
    .select("+password +passwordRequests +sessionVersion")
    .lean();
}
before(async () => {
  await mongoose.connect(
    process.env.TEST_MONGODB_URI ||
      process.env.MONGODB_URI ||
      "mongodb://127.0.0.1:27017/smart_queue",
    { dbName: databaseName, serverSelectionTimeoutMS: 10000 },
  );
  await User.init();
  const password = await bcrypt.hash(originalPassword, 4);
  [admin, student, staff, disabled] = await User.create([
    {
      fullName: "Admin Tester",
      email: "admin@example.test",
      role: "admin",
      password,
    },
    {
      fullName: "Student Tester",
      email: "student@example.test",
      role: "student",
      studentID: "S001",
      password,
    },
    {
      fullName: "Staff Tester",
      email: "staff@example.test",
      role: "staff",
      password,
    },
    {
      fullName: "Disabled Tester",
      email: "disabled@example.test",
      role: "student",
      isActive: false,
      password,
    },
  ]);
  oldToken = token(student);
  const app = express();
  app.use(express.json());
  app.use("/auth", require("../routes/authRoutes"));
  app.use("/admin", require("../routes/adminRoutes"));
  app.get("/student-check", require("../middleware/studentAuth"), (_req, res) =>
    res.json({ ok: true }),
  );
  app.use((error, _req, res, _next) =>
    res.status(500).json({ message: error.message }),
  );
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
      databaseName.startsWith("smartqueue_admin_test_")
    )
      await mongoose.connection.dropDatabase();
  } finally {
    await mongoose.disconnect();
  }
});

test("admin endpoints enforce signed tokens, current role, and active account", async () => {
  for (const path of ["/admin/summary", "/admin/users", "/admin/requests"]) {
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, "forged")).status, 401);
    assert.equal((await request(path, token(student))).status, 403);
    assert.equal((await request(path, token(staff))).status, 403);
    const allowed = await request(path, token(admin));
    assert.equal(allowed.status, 200, JSON.stringify(allowed.data));
  }
  const forgedRole = jwt.sign(
    { id: student._id.toString(), role: "admin" },
    process.env.JWT_SECRET,
  );
  assert.equal((await request("/admin/summary", forgedRole)).status, 403);
  await User.updateOne({ _id: admin._id }, { $set: { isActive: false } });
  assert.equal((await request("/admin/summary", token(admin))).status, 403);
  await User.updateOne({ _id: admin._id }, { $set: { isActive: true } });
});
test("forgot password returns a uniform response and permits one pending request", async () => {
  const results = await Promise.all([
    request("/auth/forgot-password", null, "POST", {
      email: " STUDENT@example.test ",
      note: "Please help",
    }),
    request("/auth/forgot-password", null, "POST", { email: student.email }),
    request("/auth/forgot-password", null, "POST", { email: staff.email }),
    request("/auth/forgot-password", null, "POST", {
      email: "missing@example.test",
    }),
    request("/auth/forgot-password", null, "POST", { email: admin.email }),
    request("/auth/forgot-password", null, "POST", { email: disabled.email }),
  ]);
  for (const result of results) {
    assert.equal(result.status, 202);
    assert.deepEqual(result.data, results[0].data);
  }
  assert.equal((await record(student)).passwordRequests.length, 1);
  assert.equal((await record(staff)).passwordRequests.length, 1);
  assert.equal((await record(admin)).passwordRequests.length, 0);
  assert.equal((await record(disabled)).passwordRequests.length, 0);
  assert.ok(
    await bcrypt.compare(originalPassword, (await record(student)).password),
  );
});
test("lists, searches and counts requests without disclosing password hashes", async () => {
  const stats = await request("/admin/summary", token(admin));
  assert.deepEqual(stats.data, {
    students: 2,
    staff: 1,
    pending: 2,
    completed: 0,
    rejected: 0,
  });
  const list = await request(
    "/admin/requests?status=pending&search=S001",
    token(admin),
  );
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].email, student.email);
  assert.equal("password" in list.data.items[0], false);
  const users = await request("/admin/users?role=staff", token(admin));
  assert.equal(users.data.total, 1);
  assert.equal("passwordRequests" in users.data.items[0], false);
  assert.equal(
    (await request("/admin/users?search=%5B.*", token(admin))).data.total,
    0,
  );
});
test("reset requires admin, identity verification, matching passwords, and bcrypt byte limit", async () => {
  const id = (await record(student)).passwordRequests[0]._id;
  const valid = {
    action: "reset",
    password: newPassword,
    confirmation: newPassword,
    verified: true,
  };
  assert.equal(
    (
      await request(
        `/admin/requests/${id}/resolve`,
        token(student),
        "POST",
        valid,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/admin/requests/${id}/resolve`,
        token(staff),
        "POST",
        valid,
      )
    ).status,
    403,
  );
  for (const body of [
    { ...valid, verified: false },
    { ...valid, confirmation: "different" },
    { ...valid, password: "short", confirmation: "short" },
    { ...valid, password: "界".repeat(25), confirmation: "界".repeat(25) },
  ]) {
    assert.equal(
      (
        await request(
          `/admin/requests/${id}/resolve`,
          token(admin),
          "POST",
          body,
        )
      ).status,
      400,
    );
  }
  assert.equal((await record(student)).passwordRequests[0].status, "pending");
});
test("concurrent resolutions commit exactly once and revoke existing sessions", async () => {
  const id = (await record(student)).passwordRequests[0]._id;
  assert.equal((await request("/student-check", oldToken)).status, 200);
  const body = {
    action: "reset",
    password: newPassword,
    confirmation: newPassword,
    verified: true,
  };
  const results = await Promise.all([
    request(`/admin/requests/${id}/resolve`, token(admin), "POST", body),
    request(`/admin/requests/${id}/resolve`, token(admin), "POST", body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const saved = await record(student);
  assert.ok(await bcrypt.compare(newPassword, saved.password));
  assert.equal(saved.sessionVersion, 1);
  assert.equal(saved.passwordRequests[0].status, "completed");
  assert.equal(saved.passwordRequests[0].resolvedByName, admin.fullName);
  assert.equal((await request("/student-check", oldToken)).status, 401);
  assert.equal(
    (
      await request("/auth/login", null, "POST", {
        email: student.email,
        password: originalPassword,
      })
    ).status,
    401,
  );
  const login = await request("/auth/login", null, "POST", {
    email: student.email,
    password: newPassword,
  });
  assert.equal(login.status, 200);
  assert.equal((await request("/student-check", login.data.token)).status, 200);
  assert.equal(
    JSON.stringify(saved.passwordRequests).includes(newPassword),
    false,
  );
  assert.equal("passwordRequests" in login.data.user, false);
});
test("rejection requires a reason and preserves the staff password and sessions", async () => {
  const id = (await record(staff)).passwordRequests[0]._id;
  assert.equal(
    (
      await request(`/admin/requests/${id}/resolve`, token(admin), "POST", {
        action: "reject",
        reason: " ",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/admin/requests/${id}/resolve`, token(admin), "POST", {
        action: "reject",
        reason: "Identity could not be verified",
      })
    ).status,
    200,
  );
  const saved = await record(staff);
  assert.ok(await bcrypt.compare(originalPassword, saved.password));
  assert.equal(saved.sessionVersion, 0);
  assert.equal(saved.passwordRequests[0].status, "rejected");
  const history = await request("/admin/requests?activity=true", token(admin));
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.total, 2);
  assert.ok(
    history.data.items.every(
      (item) => item.resolvedByName === admin.fullName && item.resolvedAt,
    ),
  );
});
test("session validation covers all roles and rejects revoked or disabled accounts", async () => {
  assert.equal((await request("/auth/session")).status, 401);
  assert.equal((await request("/auth/session", token(admin))).status, 200);
  assert.equal((await request("/auth/session", token(staff))).status, 200);
  assert.equal((await request("/auth/session", oldToken)).status, 401);
  assert.equal((await request("/auth/session", token(student, 1))).status, 200);
  assert.equal((await request("/auth/session", token(disabled))).status, 403);
});
test("staff reset revokes its session and disabled accounts cannot be reset", async () => {
  const pending = { _id: new mongoose.Types.ObjectId(), status: "pending" };
  await User.updateOne(
    { _id: staff._id },
    { $push: { passwordRequests: pending } },
  );
  const beforeToken = token(staff);
  const body = {
    action: "reset",
    password: newPassword,
    confirmation: newPassword,
    verified: true,
  };
  assert.equal(
    (
      await request(
        `/admin/requests/${pending._id}/resolve`,
        token(admin),
        "POST",
        body,
      )
    ).status,
    200,
  );
  assert.equal((await request("/auth/session", beforeToken)).status, 401);
  const login = await request("/auth/login", null, "POST", {
    email: staff.email,
    password: newPassword,
  });
  assert.equal(login.status, 200);
  assert.equal((await request("/auth/session", login.data.token)).status, 200);
  const blocked = { _id: new mongoose.Types.ObjectId(), status: "pending" };
  await User.updateOne(
    { _id: disabled._id },
    { $push: { passwordRequests: blocked } },
  );
  assert.equal(
    (
      await request(
        `/admin/requests/${blocked._id}/resolve`,
        token(admin),
        "POST",
        body,
      )
    ).status,
    409,
  );
  assert.ok(
    await bcrypt.compare(originalPassword, (await record(disabled)).password),
  );
});
test("public recovery validates input, enforces a cooldown and rate limits repeated submissions", async () => {
  assert.equal(
    (
      await request("/auth/forgot-password", null, "POST", {
        email: { $ne: null },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/forgot-password", null, "POST", {
        email: student.email,
        note: "x".repeat(501),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/auth/forgot-password", null, "POST", {
        email: student.email,
      })
    ).status,
    202,
  );
  assert.equal((await record(student)).passwordRequests.length, 1);
  await request("/auth/forgot-password", null, "POST", {
    email: student.email,
  });
  assert.equal(
    (
      await request("/auth/forgot-password", null, "POST", {
        email: student.email,
      })
    ).status,
    429,
  );
});
