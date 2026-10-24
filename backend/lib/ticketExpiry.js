const Department = require("../models/Department");
const Ticket = require("../models/QueueTicket");
const Appointment = require("../models/Appointment");
const { dateInVietnam, workingPeriods } = require("./appointmentSchedule");

function dayEndsAt(serviceDate, workingHours) {
  const periods = workingPeriods(workingHours);
  // Invalid hours must not cancel today's tickets prematurely.
  const closingMinute = periods.length ? periods.at(-1)[1] : 1440;
  return new Date(new Date(`${serviceDate}T00:00:00+07:00`).getTime() + closingMinute * 60000);
}

async function cancelEndedTickets({ now = new Date(), department, student } = {}) {
  const today = dateInVietnam(now);
  const offices = await Department.find(department ? { _id: department } : {})
    .select("workingHours").lean();
  const endedOffices = offices.filter((office) => now >= dayEndsAt(today, office.workingHours)).map((office) => office._id);
  const ended = { $or: [
    { serviceDate: { $lt: today } },
    { serviceDate: today, department: { $in: endedOffices } },
  ], ...(department ? { department } : {}), ...(student ? { student } : {}) };
  // The status predicate and history append commit atomically. A visit already
  // being served is preserved, including when staff start it during the sweep.
  const result = await Ticket.updateMany({ ...ended, status: { $in: ["waiting", "called"] } }, {
    $set: {
      status: "cancelled", cancelledAt: now, cancellationReason: "end_of_day", updatedAt: now,
    },
    $push: { statusHistory: { status: "cancelled", at: now, actor: null } },
  });
  // Reconcile on every sweep so an interrupted process does not leave the
  // appointment confirmed after its linked ticket has been cancelled.
  const cancelled = await Ticket.find({ ...ended, cancellationReason: "end_of_day", status: "cancelled", appointment: { $ne: null } }).select("appointment").lean();
  if (cancelled.length) {
    await Appointment.updateMany({ _id: { $in: cancelled.map((ticket) => ticket.appointment) }, status: "confirmed" }, {
      $set: { status: "cancelled", cancelledAt: now, cancellationReason: "end_of_day" },
    });
  }
  // Appointments blocked by another active ticket may never have entered the queue.
  const cutoff = new Date(`${today}T00:00:00+07:00`);
  const pending = await Appointment.find({ status: "confirmed", ...(department ? { department } : {}), ...(student ? { student } : {}),
    $or: [{ startsAt: { $lt: cutoff } }, { startsAt: { $gte: cutoff, $lte: now }, department: { $in: endedOffices } }],
  }).select("_id").lean();
  if (!pending.length) return result.modifiedCount;
  const linked = await Ticket.find({ appointment: { $in: pending.map((item) => item._id) } }).select("appointment").lean();
  const linkedIds = new Set(linked.map((ticket) => String(ticket.appointment)));
  await Appointment.updateMany({ _id: { $in: pending.filter((item) => !linkedIds.has(String(item._id))).map((item) => item._id) }, status: "confirmed" }, {
    $set: { status: "cancelled", cancelledAt: now, cancellationReason: "end_of_day" },
  });
  return result.modifiedCount;
}

module.exports = { dayEndsAt, cancelEndedTickets };
