const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const authRoutes = require("./routes/authRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const queueRoutes = require("./routes/queueRoutes");
const QueueTicket = require("./models/QueueTicket");
const Appointment = require("./models/Appointment");

dotenv.config({ quiet: true });

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
app.use("/api/appointments", require("./routes/appointmentRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use((error, _req, res, _next) => {
  console.error("API error:", error.message);
  res.status(500).json({ message: "Unable to complete this request. Please try again." });
});

mongoose
  .connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(async () => {
    await Promise.all([QueueTicket.init(), Appointment.init()]);
    console.log("Connected to MongoDB");
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });
