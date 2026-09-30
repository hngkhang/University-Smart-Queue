const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");

module.exports = (role) => async (req, res, next) => {
  if (mongoose.connection.readyState !== 1)
    return res.status(503).json({ message: "Database is not connected." });
  if (!process.env.JWT_SECRET)
    return res
      .status(503)
      .json({ message: "Authentication is temporarily unavailable." });
  let payload;
  try {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    payload = jwt.verify(token || "", process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (!mongoose.isObjectIdOrHexString(payload.id))
      throw new Error("Invalid user");
  } catch {
    return res.status(401).json({ message: "Please sign in again." });
  }
  try {
    const user = await User.findById(payload.id)
      .select("+sessionVersion")
      .lean();
    if (!user || (payload.sessionVersion || 0) !== (user.sessionVersion || 0))
      return res
        .status(401)
        .json({ message: "Your session has expired. Please sign in again." });
    if ((role && user.role !== role) || user.isActive === false)
      return res
        .status(403)
        .json({ message: `An active ${role || "user"} account is required.` });
    req.user = user;
    if (role === "student") req.student = user;
    next();
  } catch (error) {
    next(error);
  }
};
