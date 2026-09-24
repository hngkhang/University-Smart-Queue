const readline = require("readline");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const User = require("../models/User");

dotenv.config({ quiet: true });

const mongoUri =
  process.env.MONGODB_URL ||
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/smart_queue";

const email = process.argv[2]?.trim().toLowerCase();
const passwordFromCommand = process.argv[3];

const askHidden = (question) =>
  new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;

    output.write(question);
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");

    let value = "";

    const onData = (char) => {
      if (char === "\u0003") {
        output.write("\n");
        process.exit(1);
      }

      if (char === "\r" || char === "\n") {
        input.setRawMode?.(false);
        input.pause();
        input.removeListener("data", onData);
        output.write("\n");
        resolve(value);
        return;
      }

      if (char === "\b" || char === "\u007f") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    input.on("data", onData);
  });

const closeConnection = async () => {
  await mongoose.connection.close();
};

const resetPassword = async () => {
  if (!email) {
    console.error("Usage: npm run reset-password -- user@example.com [newPassword]");
    process.exit(1);
  }

  const password = passwordFromCommand || (await askHidden("New password (hidden): "));
  const confirmation = passwordFromCommand
    ? passwordFromCommand
    : await askHidden("Confirm password (hidden): ");

  if (!password || password.length < 6) {
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  if (password !== confirmation) {
    console.error("Password confirmation does not match.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  const user = await User.findOne({ email }).select("_id email fullName");

  if (!user) {
    console.error(`No user found with email: ${email}`);
    await closeConnection();
    process.exit(1);
  }

  user.password = await bcrypt.hash(password, 12);
  await user.save();
  await closeConnection();

  console.log(`Password reset successfully for ${user.email}.`);
};

resetPassword().catch(async (error) => {
  console.error("Unable to reset password:", error.message);
  await closeConnection().catch(() => {});
  process.exit(1);
});
