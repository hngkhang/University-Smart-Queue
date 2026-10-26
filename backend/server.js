const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const path = require("node:path");
const { createServer } = require("node:http");
const { attachQueueRealtime } = require("./lib/queueRealtime");
const authRoutes = require("./routes/authRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const queueRoutes = require("./routes/queueRoutes");
const QueueTicket = require("./models/QueueTicket");
const Appointment = require("./models/Appointment");
const { admitDueAppointments } = require("./lib/appointmentQueue");

dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

const app = express();
const port = process.env.PORT || 5000;
const mongoUri =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/smart_queue";
const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://127.0.0.1:5173",
  "http://localhost:5173",
].filter(Boolean);
const isLocalDevOrigin = (origin) =>
  /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        isLocalDevOrigin(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use("/api/ai", require("./ai/usage/recorder").aiMiddleware);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    message: "Smart Queue API is running.",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));
app.use((error, _req, res, _next) => {
  if (["entity.parse.failed", "entity.too.large"].includes(error.type)) {
    require("./ai/usage/recorder").setOutcome("rejected", error.type === "entity.parse.failed" ? "AI_INVALID_JSON" : "AI_BODY_TOO_LARGE");
    return res.status(error.type === "entity.parse.failed" ? 400 : 413).json({ message: "Invalid or oversized request body." });
  }
  console.error("API error:", error.message);
  res.status(500).json({ message: "Unable to complete this request. Please try again." });
});

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(async () => {
    await Promise.all([QueueTicket.init(), Appointment.init(), require("./models/AiRequestLog").init()]);
    console.log("Connected to MongoDB");
    const admit = () => admitDueAppointments().catch((error) => console.error("Appointment queue admission failed:", error));
    void admit();
    setInterval(admit, 15000).unref();
    const server = createServer(app);
    attachQueueRealtime(server, {
      isAllowedOrigin: (origin) => allowedOrigins.includes(origin) || isLocalDevOrigin(origin),
    });
    server.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("API could not start:", error.message);
    console.error(
      "Check MONGODB_URI in backend/.env and make sure MongoDB is reachable. " +
        "The login page cannot connect until the API starts successfully.",
    );
    process.exitCode = 1;
  });
