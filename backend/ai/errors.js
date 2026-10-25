class AiError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

module.exports = { AiError };
