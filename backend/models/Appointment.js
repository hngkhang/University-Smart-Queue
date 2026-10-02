const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: "Department", required: true },
  departmentName: { type: String, required: true },
  location: { type: String, required: true },
  services: [{
    _id: false,
    name: { type: String, required: true },
    estimatedDuration: { type: Number, required: true, min: 1 },
  }],
  estimatedServiceTime: { type: Number, required: true, min: 1 },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  reservedMinutes: { type: [Number], required: true, select: false },
  notes: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["confirmed", "cancelled"], default: "confirmed" },
  cancelledAt: { type: Date, default: null },
}, { collection: "appointments", timestamps: true });

// Each document reserves all minutes in [start, end) atomically. These unique
// multikey indexes prevent overlapping visits even across different API processes.
for (const resource of ["department", "student"]) {
  schema.index({ [resource]: 1, reservedMinutes: 1 }, {
    unique: true,
    partialFilterExpression: { status: "confirmed" },
    name: `appointment_${resource}_minutes`,
  });
}
schema.index({ student: 1, startsAt: -1 });
schema.index({ department: 1, status: 1, startsAt: 1 });

module.exports = mongoose.model("Appointment", schema);
