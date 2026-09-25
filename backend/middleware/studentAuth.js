const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

module.exports = async function studentAuth(req, res, next) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ message: "Database is not connected." });
  }
  if (!process.env.JWT_SECRET) {
    return res
      .status(503)
      .json({ message: "Authentication is temporarily unavailable." });
  }
  let payload;
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    payload = jwt.verify(token || "", process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (!mongoose.isObjectIdOrHexString(payload.id))
      throw new Error("Invalid user");
  } catch {
    return res
      .status(401)
      .json({ message: "Please sign in again to manage your queue." });
  }
  try {
    const user = await User.findById(payload.id).lean();
    if (!user)
      return res.status(401).json({ message: "Please sign in again." });
    if (user.role !== "student" || user.isActive === false) {
      return res
        .status(403)
        .json({
          message: "An active student account is required to join a queue.",
        });
    }
    req.student = user;
    return next();
  } catch (error) {
    return next(error);
  }
};
