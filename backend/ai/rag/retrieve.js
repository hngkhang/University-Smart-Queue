const vectorStore = require("../vectorStore");

async function retrieve(question, user) {
  // Keep authorization in the backend when implementing the adapter.
  if (!user?._id) throw new TypeError("An authenticated user is required.");
  return vectorStore.search({ question, userId: String(user._id), role: user.role });
}

module.exports = { retrieve };
