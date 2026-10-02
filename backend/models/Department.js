const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    estimatedDuration: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const locationSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, default: "" },
    x: {
      type: Number,
      default: 0,
    },
    y: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  },
);

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    vietnameseName: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isArchived: { type: Boolean, default: false },
    staff: {
      type: [String],
      default: [],
    },
    services: {
      type: [serviceSchema],
      default: [],
    },
    location: {
      type: locationSchema,
      default: () => ({}),
    },
    workingHours: {
      type: String,
      trim: true,
      default: "",
    },
    bookingEnabled: { type: Boolean, default: true },
    bookingWeekdays: { type: [Number], default: [1, 2, 3, 4, 5] },
    bookingExcludedDates: { type: [String], default: [] },
  },
  {
    collection: "departments",
    timestamps: true,
  },
);

module.exports = mongoose.model("Department", departmentSchema);
