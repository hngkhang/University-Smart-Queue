const express = require("express");
const mongoose = require("mongoose");
const Department = require("../models/Department");
const Queue = require("../models/Queue");
const QueueTicket = require("../models/QueueTicket");

const router = express.Router();

const DEFAULT_WORKING_HOURS = "07:30 - 11:30 | 13:00 - 16:30";

const formatLocation = (location) => {
  if (!location || typeof location !== "object") {
    return "HCMUTE Campus";
  }

  const hasCoordinates =
    typeof location.x === "number" && typeof location.y === "number";

  if (!hasCoordinates) {
    return "HCMUTE Campus";
  }

  return `HCMUTE Campus (${location.x}, ${location.y})`;
};

const getStatus = (department, queue) => {
  if (!department.isActive || !queue?.isOpen) {
    return "closed";
  }

  if (queue.isPaused) {
    return "paused";
  }

  return "open";
};

const mapDepartmentResponse = (department, queue, waitingCount = 0) => {
  const services = Array.isArray(department.services)
    ? department.services.map((service) => service.name).filter(Boolean)
    : [];

  return {
    id: department._id.toString(),
    name: department.name,
    vietnameseName: department.vietnameseName || department.name,
    description: department.description,
    status: getStatus(department, queue),
    waitingCount,
    estimatedWait: null,
    activeCounters: null,
    services,
    serviceDetails: (department.services || []).map((service) => ({
      name: service.name,
      estimatedDuration: service.estimatedDuration || 0,
    })),
    location: formatLocation(department.location),
    workingHours: department.workingHours || DEFAULT_WORKING_HOURS,
  };
};

const getQueuesByDepartment = async (departmentIds) => {
  const queues = await Queue.find({
    department: {
      $in: departmentIds,
    },
  }).lean();

  return new Map(
    queues.map((queue) => [queue.department.toString(), queue]),
  );
};

router.get("/", async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: "Database is not connected.",
      });
    }

    const departments = await Department.find({})
      .sort({ name: 1 })
      .lean();
    const queueByDepartment = await getQueuesByDepartment(
      departments.map((department) => department._id),
    );
    const counts = await QueueTicket.aggregate([
      { $match: { status: "waiting" } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
    ]);
    const waitingCounts = new Map(counts.map((item) => [item._id.toString(), item.count]));

    return res.json({
      departments: departments.map((department) =>
        mapDepartmentResponse(
          department,
          queueByDepartment.get(department._id.toString()),
          waitingCounts.get(department._id.toString()) || 0,
        ),
      ),
    });
  } catch (error) {
    console.error("Load departments error:", error);
    return res.status(500).json({
      message: "Unable to load departments right now.",
    });
  }
});

router.get("/:departmentId", async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.departmentId)) {
      return res.status(400).json({ message: "Invalid department." });
    }
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        message: "Database is not connected.",
      });
    }

    const department = await Department.findById(req.params.departmentId).lean();

    if (!department) {
      return res.status(404).json({
        message: "Department not found.",
      });
    }

    const queue = await Queue.findOne({
      department: department._id,
    }).lean();

    return res.json({
      department: mapDepartmentResponse(department, queue, await QueueTicket.countDocuments({
        department: department._id, status: "waiting",
      })),
    });
  } catch (error) {
    console.error("Load department error:", error);
    return res.status(500).json({
      message: "Unable to load department right now.",
    });
  }
});

module.exports = router;
