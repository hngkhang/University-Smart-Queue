const path = require("node:path");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { migrateAppointmentIndexes } = require("../lib/appointmentIndexes");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });

async function fingerprint(collection) {
  const hash = createHash("sha256");
  let count = 0;
  for await (const document of collection.find({}).sort({ _id: 1 })) {
    hash.update(mongoose.mongo.BSON.EJSON.stringify(document));
    count++;
  }
  return { count, digest: hash.digest("hex") };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply")) throw new Error("Usage: node scripts/migrateAppointmentIndexes.js [--apply]");
  // Avoid implicit schema/index changes, including in dry-run mode.
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_queue", {
    autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000,
  });
  const collection = mongoose.connection.db.collection("appointments");
  const before = await fingerprint(collection);
  const result = await migrateAppointmentIndexes(collection, { apply: args.includes("--apply") });
  const after = await fingerprint(collection);
  console.log(JSON.stringify({ database: mongoose.connection.name, ...result,
    documentsBefore: before.count, documentsAfter: after.count,
    documentsUnchanged: before.digest === after.digest,
  }, null, 2));
  if (before.digest !== after.digest) {
    throw new Error("Appointment data changed during inspection (possibly concurrent bookings). Review before retrying; this script only changes indexes.");
  }
}

main().catch((error) => {
  console.error("Appointment index migration failed:", error.message);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
