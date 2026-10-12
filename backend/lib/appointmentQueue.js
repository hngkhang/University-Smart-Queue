const Appointment = require("../models/Appointment");
const QueueTicket = require("../models/QueueTicket");
const QueueSequence = require("../models/QueueSequence");

const EARLY_MINUTES = 5;
const activeStatuses = ["waiting", "called", "serving"];
const vietnamDate = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);

async function admitDueAppointments({ now = new Date(), department, student } = {}) {
  const today = vietnamDate(now);
  const due = await Appointment.find({
    status: "confirmed",
    startsAt: {
      $gte: new Date(`${today}T00:00:00+07:00`),
      $lte: new Date(now.getTime() + EARLY_MINUTES * 60000),
    },
    ...(department ? { department } : {}),
    ...(student ? { student } : {}),
  }).sort({ startsAt: 1, _id: 1 }).lean();
  let admitted = 0;
  for (const appointment of due) {
    if (await QueueTicket.exists({ appointment: appointment._id })) continue;
    // Keep one active queue position per student. Retry on the next sweep if a
    // walk-in ticket is still active when the appointment becomes due.
    if (await QueueTicket.exists({ student: appointment.student, status: { $in: activeStatuses } })) continue;
    const serviceDate = vietnamDate(appointment.startsAt);
    const sequence = await QueueSequence.findOneAndUpdate(
      { _id: `${appointment.department}:${serviceDate}` },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    try {
      const ticket = await QueueTicket.create({
        student: appointment.student,
        department: appointment.department,
        departmentName: appointment.departmentName,
        appointment: appointment._id,
        appointmentStartsAt: appointment.startsAt,
        serviceDate,
        number: sequence.value,
        services: appointment.services,
        estimatedServiceTime: appointment.estimatedServiceTime,
        notes: appointment.notes,
        statusHistory: [{ status: "waiting", at: now, actor: appointment.student }],
      });
      // If the student cancelled while the ticket was being created, remove it
      // from the callable queue. The unique appointment index prevents retries
      // and other API instances from producing a second ticket.
      if (!(await Appointment.exists({ _id: appointment._id, status: "confirmed" }))) {
        await QueueTicket.updateOne({ _id: ticket._id, status: "waiting" }, {
          $set: { status: "cancelled", cancelledAt: new Date() },
          $push: { statusHistory: { status: "cancelled", at: new Date(), actor: appointment.student } },
        });
      } else admitted++;
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Another API instance admitted this appointment or the student obtained
      // an active ticket in the meantime. Both cases are retried or complete.
    }
  }
  return admitted;
}

module.exports = { EARLY_MINUTES, admitDueAppointments };
