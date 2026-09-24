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
  },
  {
    collection: "departments",
    timestamps: true,
  },
);

module.exports = mongoose.model("Department", departmentSchema);
