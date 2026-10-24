const { reservedMinutes } = require("./appointmentSchedule");

const legacyIndexes = [
  { name: "reference_1", key: { reference: 1 } },
  { name: "department_1_occupiedMinutes_1", key: { department: 1, occupiedMinutes: 1 }, partial: true },
  { name: "student_1_occupiedMinutes_1", key: { student: 1, occupiedMinutes: 1 }, partial: true },
];
const sameKey = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const confirmedOnly = (index) => sameKey(index.partialFilterExpression, { status: "confirmed" });

function isAppointmentOverlap(error) {
  return error.code === 11000 && ["department", "student"].some((resource) =>
    sameKey(error.keyPattern, { [resource]: 1, reservedMinutes: 1 }));
}

async function inspectAppointmentIndexes(collection) {
  const indexes = await collection.indexes();
  // Require working replacement constraints before removing any old constraint.
  for (const resource of ["department", "student"]) {
    const index = indexes.find((item) => item.name === `appointment_${resource}_minutes`);
    if (!index || !index.unique || !confirmedOnly(index) ||
        !sameKey(index.key, { [resource]: 1, reservedMinutes: 1 })) {
      throw new Error(`Missing or unexpected appointment_${resource}_minutes index. No legacy indexes removed.`);
    }
  }
  let confirmedCount = 0;
  const cursor = collection.find({ status: "confirmed" }, {
    projection: { department: 1, student: 1, startsAt: 1, endsAt: 1, reservedMinutes: 1 },
  });
  for await (const appointment of cursor) {
    const { startsAt, endsAt, department, student } = appointment;
    const start = startsAt instanceof Date ? startsAt.getTime() : NaN;
    const end = endsAt instanceof Date ? endsAt.getTime() : NaN;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start % 60000 || end % 60000 ||
        end <= start || end - start > 1440 * 60000 ||
        department?._bsontype !== "ObjectId" || student?._bsontype !== "ObjectId" ||
        !sameKey(appointment.reservedMinutes, reservedMinutes(startsAt, endsAt))) {
      throw new Error(`Appointment ${appointment._id} has invalid reservation data. No legacy indexes removed.`);
    }
    confirmedCount++;
  }
  const toDrop = [];
  for (const legacy of legacyIndexes) {
    const index = indexes.find((item) => item.name === legacy.name);
    if (!index) continue;
    if (!index.unique || !sameKey(index.key, legacy.key) || index.sparse ||
        (legacy.partial ? !confirmedOnly(index) : !!index.partialFilterExpression)) {
      throw new Error(`Unexpected definition for ${legacy.name}. No legacy indexes removed.`);
    }
    toDrop.push(legacy.name);
  }
  return { confirmedCount, toDrop };
}

async function migrateAppointmentIndexes(collection, { apply = false } = {}) {
  const plan = await inspectAppointmentIndexes(collection);
  if (apply) {
    for (const name of plan.toDrop) await collection.dropIndex(name);
    const after = await inspectAppointmentIndexes(collection);
    if (after.toDrop.length) throw new Error("Legacy indexes remain after migration.");
  }
  return { ...plan, applied: apply };
}

module.exports = { isAppointmentOverlap, inspectAppointmentIndexes, migrateAppointmentIndexes };
