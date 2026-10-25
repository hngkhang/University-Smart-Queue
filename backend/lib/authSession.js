const jwt = require("jsonwebtoken");

function buildUserResponse(user) {
  return Object.fromEntries([
    ["id", user._id],
    ...["fullName", "email", "role", "department", "studentID", "phone", "isActive", "createdAt", "updatedAt"]
      .map((key) => [key, user[key]]),
  ]);
}

function issueSession(user, rememberMe, authMethod = "password") {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured.");
  const token = jwt.sign({
    id: String(user._id), email: user.email, role: user.role,
    sessionVersion: user.sessionVersion || 0, authMethod,
  }, process.env.JWT_SECRET, {
    algorithm: "HS256", expiresIn: rememberMe === true ? "7d" : "8h",
  });
  return { message: "Login successful.", token, user: buildUserResponse(user) };
}

module.exports = { buildUserResponse, issueSession };
