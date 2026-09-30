const mongoose = require("mongoose");

// Embedded so password, session revocation, and audit commit atomically on standalone MongoDB.
const passwordRequestSchema = new mongoose.Schema({
  note: { type: String, maxlength: 500, default: "" },
  status: {
    type: String,
    enum: ["pending", "completed", "rejected"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  resolvedByName: { type: String, default: "" },
  reason: { type: String, default: "", maxlength: 500 },
});

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      // Recovery is available to students and staff; only admins can resolve it.
      type: String,
      enum: ["student", "staff", "admin"],
      default: "student",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "departments",
      default: null,
    },
    sessionVersion: { type: Number, default: 0, select: false },
    passwordRequests: {
      type: [passwordRequestSchema],
      default: [],
      select: false,
    },
    lastPasswordRequestAt: { type: Date, select: false },
    studentID: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: "users",
    timestamps: true,
  },
);

module.exports = mongoose.model("User", userSchema);
