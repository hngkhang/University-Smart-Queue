const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const recoveryLimiter = require("../middleware/recoveryLimiter");

const router = express.Router();
router.get("/session", require("../middleware/requireRole")(), (_req, res) => {
  res.set("Cache-Control", "no-store").json({ valid: true });
});

const buildUserResponse = (user) => ({
  id: user._id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  department: user.department,
  studentID: user.studentID,
  phone: user.phone,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role, rememberMe } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: "Database is not connected.",
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
      .select("+password +sessionVersion")
      .lean();

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "This account has been disabled.",
      });
    }

    if (role && user.role !== role) {
      return res.status(403).json({
        message: "Selected role does not match this account.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({
        message: "JWT_SECRET is not configured on the server.",
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion || 0,
      },
      jwtSecret,
      {
        expiresIn: rememberMe ? "7d" : "8h",
      },
    );

    return res.json({
      message: "Login successful.",
      token,
      user: buildUserResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Unable to login right now.",
    });
  }
});

router.post("/forgot-password", recoveryLimiter, async (req, res, next) => {
  const { email, note = "" } = req.body || {};
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof note !== "string" ||
    note.length > 500
  ) {
    return res
      .status(400)
      .json({
        message:
          "Enter a valid email and a note of no more than 500 characters.",
      });
  }
  if (mongoose.connection.readyState !== 1)
    return res
      .status(503)
      .json({ message: "Database is not connected. Please try again later." });
  try {
    const now = new Date();
    await User.updateOne(
      {
        email: email.trim().toLowerCase(),
        role: { $in: ["student", "staff"] },
        isActive: { $ne: false },
        passwordRequests: { $not: { $elemMatch: { status: "pending" } } },
        $or: [
          { lastPasswordRequestAt: { $exists: false } },
          {
            lastPasswordRequestAt: {
              $lt: new Date(Date.now() - 15 * 60 * 1000),
            },
          },
        ],
      },
      {
        $push: { passwordRequests: { note: note.trim(), createdAt: now } },
        $set: { lastPasswordRequestAt: now },
      },
      { runValidators: true },
    );
    res
      .status(202)
      .json({
        message:
          "If this email belongs to an eligible account, your request has been sent to an administrator. If a request is already pending, it remains in the queue. Contact your service office to verify your identity and collect your new password.",
      });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
