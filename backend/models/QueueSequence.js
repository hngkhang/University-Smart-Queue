const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    _id: String,
    value: { type: Number, default: 0 },
  },
  { collection: "queue_sequences", versionKey: false },
);

module.exports = mongoose.model("QueueSequence", schema);
