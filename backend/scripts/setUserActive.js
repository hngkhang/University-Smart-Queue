const dotenv = require("dotenv");
const mongoose = require("mongoose");
const User = require("../models/User");

dotenv.config({ quiet: true });

const mongoUri =
  process.env.MONGODB_URL ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/smart_queue";

const email = process.argv[2]?.trim().toLowerCase();
const activeValue = process.argv[3];

const parseActiveValue = (value) => {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return null;
};

const setUserActive = async () => {
  const isActive = parseActiveValue(activeValue);

  if (!email || isActive === null) {
    console.error("Usage: npm run set-user-active -- user@example.com true|false");
    process.exit(1);
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  const user = await User.findOneAndUpdate(
    { email },
    { isActive },
    { new: true, runValidators: true },
  ).select("email fullName isActive");

  await mongoose.connection.close();

  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  console.log(
    `Updated ${user.email}: isActive=${user.isActive}`,
  );
};

setUserActive().catch(async (error) => {
  console.error("Unable to update user:", error.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
