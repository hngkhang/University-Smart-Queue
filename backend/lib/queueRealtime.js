const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { queueEvents } = require("./queueEvents");

async function authenticate(token) {
  const payload = jwt.verify(token || "", process.env.JWT_SECRET, { algorithms: ["HS256"] });
  if (!mongoose.isObjectIdOrHexString(payload.id) || !Number.isFinite(payload.exp))
    throw new Error("Invalid session");
  const user = await User.findById(payload.id).select("+sessionVersion").lean();
  if (!user || user.isActive === false || !["student", "staff"].includes(user.role) ||
      (payload.sessionVersion || 0) !== (user.sessionVersion || 0))
    throw new Error("Invalid session");
  return payload;
}

function attachQueueRealtime(server, { isAllowedOrigin = () => false } = {}) {
  const io = new Server(server, {
    transports: ["websocket"],
    serveClient: false,
    // WebSocket upgrades do not use the browser's CORS enforcement.
    allowRequest: (req, done) => done(null, !req.headers.origin || isAllowedOrigin(req.headers.origin)),
  });
  io.use(async (socket, next) => {
    try {
      socket.data.session = await authenticate(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error("Please sign in again to receive live updates."));
    }
  });
  io.on("connection", (socket) => {
    const expiry = setTimeout(() => socket.disconnect(true),
      Math.max(0, socket.data.session.exp * 1000 - Date.now()));
    expiry.unref();
    socket.on("disconnect", () => clearTimeout(expiry));
  });

  // Only an invalidation signal is broadcast. Each screen retrieves its own
  // authorized snapshot over the existing API, including updated people-ahead counts.
  const publish = () => io.emit("queue:updated");
  queueEvents.on("updated", publish);
  const validation = setInterval(async () => {
    await Promise.all([...io.sockets.sockets.values()].map(async (socket) => {
      try { await authenticate(socket.handshake.auth?.token); }
      catch { socket.disconnect(true); }
    }));
  }, 30000);
  validation.unref();
  server.once("close", () => {
    queueEvents.off("updated", publish);
    clearInterval(validation);
  });
  return io;
}

module.exports = { attachQueueRealtime };
