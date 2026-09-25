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

module.exports = mongoose.model("QueueTicket", ticketSchema);
