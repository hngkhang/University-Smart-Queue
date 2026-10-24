const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    departmentName: { type: String, required: true },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", default: null },
    appointmentStartsAt: { type: Date, default: null },
    serviceDate: { type: String, required: true },
    number: { type: Number, required: true },
    services: [
      {
        _id: false,
        name: { type: String, required: true },
        estimatedDuration: { type: Number, default: null },
      },
    ],
    estimatedServiceTime: { type: Number, default: null },
    notes: { type: String, default: "", maxlength: 1000 },
    status: {
      type: String,
      enum: [
        "waiting",
        "called",
        "serving",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "waiting",
    },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, enum: ["end_of_day"], default: null },
    calledAt: { type: Date, default: null },
    lastCalledAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    noShowAt: { type: Date, default: null },
    assignedStaff: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedStaffName: { type: String, default: "" },
    statusHistory: [{
      _id: false,
      status: { type: String, enum: ["waiting", "called", "serving", "completed", "cancelled", "no_show"], required: true },
      at: { type: Date, required: true },
      actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],
  },
  { collection: "queue_tickets", timestamps: true },
);

// Enforced by MongoDB, including requests from different tabs or API processes.
ticketSchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["waiting", "called", "serving"] },
    },
    name: "one_active_ticket_per_student",
  },
);
ticketSchema.index(
  { department: 1, serviceDate: 1, number: 1 },
  { unique: true },
);
ticketSchema.index({ department: 1, status: 1, createdAt: 1 });
ticketSchema.index({ appointment: 1 }, {
  unique: true,
  partialFilterExpression: { appointment: { $type: "objectId" } },
  name: "one_ticket_per_appointment",
});
// A staff member can claim only one visit, even from concurrent browser tabs.
ticketSchema.index({ assignedStaff: 1 }, {
  unique: true,
  partialFilterExpression: {
    assignedStaff: { $type: "objectId" },
    status: { $in: ["called", "serving"] },
  },
  name: "one_current_ticket_per_staff",
});

module.exports = mongoose.model("QueueTicket", ticketSchema);
