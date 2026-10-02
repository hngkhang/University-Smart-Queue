const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validBookingDate, workingPeriods, slotsFor, reservedMinutes } = require("../lib/appointmentSchedule");
const now = new Date("2026-10-02T03:00:00Z");

test("date bounds use the Vietnam calendar, including midnight and invalid dates", () => {
  assert.equal(validBookingDate("2026-10-02", now), true);
  assert.equal(validBookingDate("2026-11-01", now), true);
  assert.equal(validBookingDate("2026-11-02", now), false);
  assert.equal(validBookingDate("2026-10-01", now), false);
  assert.equal(validBookingDate("2026-10-32", now), false);
  assert.equal(validBookingDate("2026-10-02", new Date("2026-10-02T18:00:00Z")), false);
});

test("working periods fail closed on malformed or overlapping hours", () => {
  assert.deepEqual(workingPeriods(""), [[450, 690], [780, 990]]);
  for (const hours of ["unknown", "08:00 - 25:00", "07:60 - 11:00", "11:00 - 07:00", "07:30 - 12:00 | 11:00 - 16:30"]) assert.deepEqual(workingPeriods(hours), []);
});

test("total service duration must fit a continuous future working period", () => {
  const slots = slotsFor({}, "2026-10-02", 25, now);
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.ok(slot.startsAt > now);
    assert.equal(slot.endsAt - slot.startsAt, 25 * 60000);
  }
  assert.ok(!slots.some((slot) => slot.startsAt.toISOString() === "2026-10-02T04:15:00.000Z"));
  assert.deepEqual(slotsFor({}, "2026-10-03", 25, now), []);
  assert.deepEqual(slotsFor({ bookingExcludedDates: ["2026-10-02"] }, "2026-10-02", 25, now), []);
  assert.deepEqual(slotsFor({}, "2026-10-02", 500, now), []);
  assert.deepEqual(slotsFor({}, "2026-10-02", 0, now), []);
  const first = slots[0];
  const minutes = reservedMinutes(first.startsAt, first.endsAt);
  assert.equal(minutes.length, 25);
  assert.equal(minutes.at(-1) * 60000, first.endsAt.getTime() - 60000);
});
