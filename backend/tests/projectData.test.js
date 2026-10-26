const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { buildPlan, readDataset, validateDataset, clone } = require("../manual-data/update-project-data");
const officeLocation = require("../lib/officeLocation");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const User = require("../models/User");
const { ObjectId } = mongoose.mongo.BSON;
const dataset = readDataset();
const oid = value => new ObjectId(value);

function fixture() {
  return {
    departments: [
      { _id: oid("6aa790376d5173ac06e23012"), name: "Registrar Office", isActive: true, location: { x: 35, y: 45 }, staff: ["6aa790376d5173ac06e2300f"] },
      { _id: oid("6aa790376d5173ac06e23013"), name: "Finance Office", isActive: true, staff: ["6aa790376d5173ac06e23010"] },
      { _id: oid("6aa790376d5173ac06e23014"), name: "Library Services", staff: [] },
    ],
    users: [
      { _id: oid("6aa790376d5173ac06e2300f"), email: "registrar.staff@campus.edu", role: "staff", department: oid("6aa790376d5173ac06e23012"), password: "existing-hash", fullName: "Registrar Staff", isActive: false, sessionVersion: 7 },
      { _id: oid("6aa790376d5173ac06e23010"), email: "finance.staff@campus.edu", role: "staff", department: oid("6aa790376d5173ac06e23013"), password: "existing-hash", fullName: "Finance Staff" },
    ],
    queues: ["12", "13", "14"].map((suffix, i) => ({ _id: new ObjectId(), department: oid(`6aa790376d5173ac06e230${suffix}`), isOpen: i !== 0, isPaused: i === 0 })),
    queue_tickets: [{ _id: new ObjectId(), department: oid("6aa790376d5173ac06e23013"), status: "cancelled", departmentName: "Finance Office", number: 1 }],
    appointments: [], queue_sequences: [{ _id: "old-sequence", value: 99 }],
  };
}

function applyInMemory(snapshot, plan) {
  for (const [name, operations] of Object.entries(plan.operations)) {
    for (const operation of operations) {
      const spec = operation.updateOne || operation.updateMany;
      let matches = snapshot[name].filter(row => Object.entries(spec.filter).every(([key, value]) => String(row[key]) === String(value)));
      const inserted = matches.length === 0;
      if (inserted && spec.upsert) {
        const row = clone(spec.filter);
        snapshot[name].push(row);
        matches = [row];
      }
      for (const row of matches) {
        for (const [key, value] of Object.entries({ ...(inserted ? spec.update.$setOnInsert : {}), ...spec.update.$set })) {
          const parts = key.split(".");
          let cursor = row;
          for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {};
          cursor[parts.at(-1)] = clone(value);
        }
      }
    }
  }
}

test("dataset has five scoped offices, twenty services and valid demo credentials", async () => {
  await validateDataset(dataset);
  assert.equal(dataset.departments.length, 5);
  assert.equal(dataset.departments.flatMap(d => d.services).length, 20);
  assert.equal(dataset.users.filter(u => u.role === "staff").length, 3);
  assert.equal(dataset.users.filter(u => u.role === "student").length, 5);
  for (const user of dataset.users) assert(await bcrypt.compare("DemoQueue@123", user.password));
});

test("migration preserves IDs, credentials, history, coordinates and configured availability on rerun", async () => {
  const snapshot = fixture();
  const before = clone(snapshot);
  const plan = buildPlan(snapshot, dataset);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(Object.keys(plan.operations), ["departments", "users", "queues"]);
  applyInMemory(snapshot, plan);
  const count = Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length]));
  applyInMemory(snapshot, buildPlan(snapshot, dataset));
  assert.deepEqual(Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, rows.length])), count);
  assert.equal(snapshot.departments.length, 6);
  assert.equal(snapshot.departments.filter(d => !d.isArchived).length, 5);
  assert.equal(snapshot.queues.length, 6);
  assert.equal(snapshot.users[0].password, "existing-hash");
  assert.equal(snapshot.users[0].isActive, false);
  assert.equal(snapshot.users[0].sessionVersion, 7);
  assert.equal(snapshot.queues[0].isOpen, false);
  assert.equal(snapshot.queues[0].isPaused, true);
  assert.equal(snapshot.departments[0].location.x, 35);
  assert.equal(snapshot.departments[0].location.label, "A1-201 / A1-202");
  assert.equal(snapshot.departments[2].isArchived, true);
  assert.equal(snapshot.queues[2].isOpen, false);
  assert.deepEqual(snapshot.queue_tickets, before.queue_tickets);
  assert.deepEqual(snapshot.queue_sequences, before.queue_sequences);
  for (const [name, Model] of [["departments", Department], ["users", User], ["queues", Queue]]) {
    for (const document of snapshot[name]) await new Model(document).validate();
  }
});

test("refuses conflicting IDs, emails, duplicate queues or unexpected offices before producing a write plan", () => {
  for (const mutate of [
    s => { s.departments[0].name = "Unrelated office"; },
    s => { s.users.push({ ...dataset.users[0], _id: new ObjectId() }); },
    s => { s.queues.push({ ...s.queues[0], _id: new ObjectId() }); },
    s => { s.departments.push({ _id: new ObjectId(), name: "Unexpected office" }); },
  ]) {
    const snapshot = fixture(); mutate(snapshot);
    assert.throws(() => buildPlan(snapshot, dataset));
  }
});

test("refuses to archive Library with staff or ongoing work", () => {
  const library = oid("6aa790376d5173ac06e23014");
  for (const mutate of [
    s => s.users.push({ _id: new ObjectId(), role: "staff", department: library }),
    s => s.queue_tickets.push({ department: library, status: "serving" }),
    s => s.appointments.push({ department: library, status: "confirmed", endsAt: new Date(Date.now() + 86400000) }),
    s => { s.queues[2].currentTicket = "Q001"; },
  ]) {
    const snapshot = fixture(); mutate(snapshot);
    assert.throws(() => buildPlan(snapshot, dataset), /Library/);
  }
});

test("office address prefers room label and keeps compatibility with legacy coordinates", () => {
  assert.equal(officeLocation({ label: " F1-309 ", x: 0, y: 0 }), "F1-309");
  assert.equal(officeLocation({ x: 35, y: 45 }), "HCMUTE Campus (35, 45)");
  assert.equal(officeLocation(null), "HCMUTE Campus");
});
