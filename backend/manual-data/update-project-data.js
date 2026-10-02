// Default: read-only preview. Writing requires the explicit --apply argument.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const mongoose = require("mongoose");
const { EJSON, ObjectId } = mongoose.mongo.BSON;

const DATABASE = "queue-management";
const LIBRARY = "6aa790376d5173ac06e23014";
const COLLECTIONS = ["departments", "users", "queues", "queue_tickets", "appointments", "queue_sequences"];
const id = value => value == null ? "" : String(value);
const clone = value => EJSON.parse(EJSON.stringify(value));

function readDataset() {
  return Object.fromEntries(["departments", "users"].map(name => [
    name, EJSON.parse(fs.readFileSync(path.join(__dirname, `${name}.json`), "utf8")),
  ]));
}

// Pure function: returns write operations without connecting or changing the snapshot.
function buildPlan(snapshot, dataset, now = new Date()) {
  const operations = { departments: [], users: [], queues: [] };
  const lines = [];
  const expectedIds = new Set(dataset.departments.map(d => id(d._id)));
  if (expectedIds.size !== 5) throw new Error("Bộ dữ liệu phải có đúng 5 văn phòng khác nhau.");
  const legacyNames = {
    "6aa790376d5173ac06e23012": "Registrar Office",
    "6aa790376d5173ac06e23013": "Finance Office",
  };
  const unknown = snapshot.departments.filter(d => !expectedIds.has(id(d._id)) && id(d._id) !== LIBRARY && d.isArchived !== true);
  if (unknown.length) throw new Error(`Có văn phòng ngoài bộ dữ liệu cần đối chiếu: ${unknown.map(d => d.name).join(", ")}`);

  const library = snapshot.departments.find(d => id(d._id) === LIBRARY);
  if (library) {
    if (library.name !== "Library Services") throw new Error("ID Library đang được dùng cho văn phòng khác.");
    const hasWork = snapshot.queue_tickets.some(t => id(t.department) === LIBRARY && ["waiting", "called", "serving"].includes(t.status)) ||
      snapshot.appointments.some(a => id(a.department) === LIBRARY && a.status === "confirmed" && new Date(a.endsAt) > now) ||
      snapshot.users.some(u => id(u.department) === LIBRARY && u.role === "staff") ||
      snapshot.queues.some(q => id(q.department) === LIBRARY && q.currentTicket != null);
    if (hasWork) throw new Error("Library có staff, vé hoặc lịch hẹn đang hoạt động. Cần xử lý các liên kết này trước khi lưu trữ Library.");
    operations.departments.push({ updateOne: { filter: { _id: library._id }, update: {
      $set: { isActive: false, isArchived: true, bookingEnabled: false, updatedAt: now },
    } } });
    operations.queues.push({ updateMany: { filter: { department: library._id }, update: {
      $set: { isOpen: false, updatedAt: now },
    } } });
    lines.push("Lưu trữ Library Services, đóng hàng đợi; giữ nguyên document và lịch sử.");
  }

  const effectiveUsers = [...snapshot.users];
  for (const user of dataset.users) {
    const existing = snapshot.users.find(u => id(u._id) === id(user._id));
    const sameEmail = snapshot.users.find(u => u.email?.toLowerCase() === user.email.toLowerCase());
    if (sameEmail && id(sameEmail._id) !== id(user._id)) throw new Error(`Email ${user.email} đã thuộc tài khoản có ID khác.`);
    if (existing && (existing.email !== user.email || existing.role !== user.role || id(existing.department) !== id(user.department))) {
      throw new Error(`ID tài khoản ${id(user._id)} có thông tin khác bộ demo.`);
    }
    if (!existing) {
      operations.users.push({ updateOne: { filter: { _id: user._id }, update: {
        $setOnInsert: { ...user, createdAt: now, updatedAt: now },
      }, upsert: true } });
      effectiveUsers.push(user);
      lines.push(`Thêm ${user.role}: ${user.email}`);
    }
  }
  const defaults = { isActive: true, studentID: "", phone: "", sessionVersion: 0, passwordRequests: [] };
  for (const user of snapshot.users) {
    const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => user[key] === undefined));
    if (Object.keys(missing).length) {
      operations.users.push({ updateOne: { filter: { _id: user._id }, update: { $set: { ...missing, updatedAt: now } } } });
      lines.push(`Bổ sung trường chưa có: ${user.email}; giữ mật khẩu và thông tin hiện tại.`);
    }
  }

  for (const [index, office] of dataset.departments.entries()) {
    const existing = snapshot.departments.find(d => id(d._id) === id(office._id));
    if (existing && ![office.name, legacyNames[id(office._id)]].includes(existing.name)) throw new Error(`ID ${id(office._id)} thuộc văn phòng khác.`);
    const duplicate = snapshot.departments.find(d => d.name === office.name && id(d._id) !== id(office._id));
    if (duplicate) throw new Error(`${office.name} đã có ID khác. Cần đối chiếu trước khi chạy.`);
    for (const requiredStaff of office.staff) {
      if (!effectiveUsers.some(u => id(u._id) === requiredStaff && u.role === "staff" && id(u.department) === id(office._id))) {
        throw new Error(`Thiếu staff ${requiredStaff} đã gán đúng cho ${office.name}. Bộ này dành cho database hiện có.`);
      }
    }
    const { _id, staff: _staff, location, ...fields } = office;
    const staff = effectiveUsers.filter(u => u.role === "staff" && id(u.department) === id(_id)).map(u => id(u._id));
    const values = { ...fields, staff, "location.label": location.label, updatedAt: now };
    // Keep deliberate queue/booking availability settings when already configured.
    for (const key of ["isActive", "workingHours", "bookingEnabled", "bookingWeekdays", "bookingExcludedDates"]) {
      if (existing?.[key] !== undefined) delete values[key];
    }
    operations.departments.push({ updateOne: { filter: { _id }, update: {
      $set: values, $setOnInsert: { createdAt: now },
    }, upsert: true } });
    lines.push(`${existing ? "Chuẩn hóa" : "Thêm"} ${office.name} | ${location.label} | ${office.services.length} dịch vụ | ${staff.length} staff`);

    const queues = snapshot.queues.filter(q => id(q.department) === id(_id));
    if (queues.length > 1) throw new Error(`${office.name} có nhiều hơn một hàng đợi. Cần xử lý trùng trước.`);
    if (!queues.length) {
      const queueId = new ObjectId(`6d000000000000000000040${index + 1}`);
      if (snapshot.queues.some(q => id(q._id) === id(queueId))) throw new Error("ID hàng đợi mới đã được dùng.");
      operations.queues.push({ updateOne: { filter: { department: _id }, update: {
        $setOnInsert: { _id: queueId, department: _id, isOpen: true, isPaused: false,
          currentTicket: null, averageServiceTime: 0, createdAt: now, updatedAt: now },
      }, upsert: true } });
    }
  }
  lines.push("Thay danh sách services của 5 văn phòng theo departments.json; giữ toàn bộ snapshot dịch vụ trong vé/lịch hẹn cũ.");
  lines.push("Không tạo vé/lịch hẹn mẫu; không thay queue_sequences; không đổi mật khẩu tài khoản đã tồn tại.");
  return { operations, lines };
}

async function readSnapshot(db, session) {
  const snapshot = {};
  // Sequential operations also work inside a MongoDB transaction.
  for (const name of COLLECTIONS) snapshot[name] = await db.collection(name).find({}, { session }).toArray();
  return snapshot;
}

async function validateDataset(dataset) {
  const Department = require("../models/Department");
  const User = require("../models/User");
  for (const document of dataset.departments) await new Department(document).validate();
  for (const document of dataset.users) await new User(document).validate();
  if (new Set(dataset.users.map(u => id(u._id))).size !== dataset.users.length ||
      new Set(dataset.users.map(u => u.email)).size !== dataset.users.length) throw new Error("Tài khoản demo có ID/email trùng.");
  for (const office of dataset.departments) {
    if (!office.location?.label || office.services.length < 1 ||
        new Set(office.services.map(s => s.name)).size !== office.services.length ||
        office.services.some(s => !Number.isInteger(s.estimatedDuration) || s.estimatedDuration <= 0)) {
      throw new Error(`Dữ liệu dịch vụ/địa điểm không hợp lệ: ${office.name}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some(arg => !["--apply", "--dry-run"].includes(arg))) {
    throw new Error("Cách dùng: node manual-data/update-project-data.js [--dry-run | --apply]");
  }
  require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
  if (!process.env.MONGODB_URI) throw new Error("Thiếu MONGODB_URI trong backend/.env.");
  const dataset = readDataset();
  await validateDataset(dataset);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  if (db.databaseName !== DATABASE) throw new Error(`Database đang chọn là ${db.databaseName}; yêu cầu ${DATABASE}. Kiểm tra MONGODB_URI.`);
  const apply = args.includes("--apply");
  console.log(`Database: ${db.databaseName} | ${apply ? "APPLY: sẽ ghi dữ liệu" : "DRY RUN: chỉ xem trước, không ghi"}`);
  const snapshot = await readSnapshot(db);
  const plan = buildPlan(snapshot, dataset);
  for (const line of plan.lines) console.log(`- ${line}`);
  if (!apply) {
    console.log("Muốn thực hiện: node manual-data/update-project-data.js --apply");
    return;
  }

  const session = await mongoose.startSession();
  let backupPath;
  try {
    await session.withTransaction(async () => {
      const current = await readSnapshot(db, session);
      const currentPlan = buildPlan(current, dataset);
      const backupDir = path.join(__dirname, "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      backupPath = path.join(backupDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`);
      fs.writeFileSync(backupPath, EJSON.stringify({ database: DATABASE, capturedAt: new Date(), collections: current }, null, 2), { flag: "wx" });
      for (const [name, operations] of Object.entries(currentPlan.operations)) {
        if (operations.length) await db.collection(name).bulkWrite(operations, { session, ordered: true });
      }
    });
  } finally { await session.endSession(); }
  console.log(`Đã cập nhật thành công. Backup trước khi ghi: ${backupPath}`);
  console.log("Refresh MongoDB Atlas Data Explorer để xem. Khởi động lại backend để dùng location.label và ẩn Library đã lưu trữ.");
}

if (require.main === module) {
  main().catch(error => {
    // Avoid printing driver connection errors that can contain connection details.
    console.error(error instanceof mongoose.mongo.MongoDriverError ? `MongoDB error: ${error.name}. Kiểm tra kết nối/quyền truy cập.` : error.message);
    process.exitCode = 1;
  }).finally(() => mongoose.disconnect());
}

module.exports = { buildPlan, readDataset, validateDataset, clone };
