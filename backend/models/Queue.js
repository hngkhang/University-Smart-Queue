const mongoose = require("mongoose");

const queueSchema = new mongoose.Schema(
  {
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "departments",
      required: true,
    },
    isOpen: {
      type: Boolean,
      default: false,
    },
    currentTicket: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    averageServiceTime: {
      type: Number,
      default: 0,
    },
    isPaused: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: "queues",
    timestamps: true,
  },
);

module.exports = mongoose.model("Queue", queueSchema);
