const { EventEmitter } = require("node:events");

const queueEvents = new EventEmitter();

// Publish only after a database write succeeds. No student data crosses this bus.
function publishQueueUpdate() {
  queueEvents.emit("updated");
}

module.exports = { queueEvents, publishQueueUpdate };
