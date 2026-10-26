const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");
const Department = require("../../models/Department");
const { getAiConfig } = require("../config");
const { AiError } = require("../errors");
const provider = require("../providers/geminiClient");
const { bookingSchema, bookingJsonSchema } = require("./schema");
const prompt = require("../prompts/bookingExtract");
const { publicCatalog } = require("./catalog");
const { matchesMinute, rejectTime, validateWorkingTime, validateExplicitRequest } = require("./timeValidation");
const { dateInVietnam, validBookingDate, slotsFor } = require("../../lib/appointmentSchedule");
const users = new Map();
const usage = require("../usage/recorder");

function matchesPreference(slot, preference) {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(slot.startsAt);
  return matchesMinute(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), preference);
}

function getBookingStatus() {
  const canDraft = getAiConfig().hasApiKey && mongoose.connection.readyState === 1;
  return { canDraft, message: canDraft
    ? "Mô tả dịch vụ và ngày giờ bạn muốn đến. Bạn sẽ kiểm tra và xác nhận ở bước tiếp theo."
    : "Chưa thể hỗ trợ điền lịch bằng AI. Bạn vẫn có thể đặt lịch bằng form." };
}

function normalizeDraft(raw, catalog, now = new Date()) {
  const parsed = bookingSchema.safeParse(raw);
  if (!parsed.success) throw new AiError("AI_INVALID_DRAFT", "AI chưa trả về thông tin hợp lệ. Bạn hãy thử lại hoặc mở form đặt lịch.", 502);
  const data = parsed.data;
  if (data.intent === "out_of_scope") return { status: "out_of_scope", draft: null, missingFields: [],
    message: "Yêu cầu này chưa phải nhu cầu đặt lịch mới. Bạn có thể chuyển sang Hỏi đáp thủ tục hoặc nêu dịch vụ muốn đặt hẹn.",
    warnings: ["Chế độ này hỗ trợ điền lịch hẹn mới. Hãy dùng Hỏi đáp thủ tục hoặc quản lý lịch hẹn cho yêu cầu khác."] };
  const warnings = [];
  let scheduleIssue = "";
  let department = catalog.find(item => String(item._id) === data.departmentId &&
    item.isActive !== false && item.isArchived !== true && item.bookingEnabled !== false);
  if (!department && data.departmentId) warnings.push("Phòng AI nhận diện không còn khả dụng. Hãy chọn lại trong form.");
  if (data.ambiguousFields.includes("departmentId")) department = null;
  let services = [...new Set(data.services)];
  if (!department || data.ambiguousFields.includes("services") || services.some(name => !department.services.some(service =>
    service.name === name && Number.isInteger(service.estimatedDuration) && service.estimatedDuration > 0))) {
    if (services.length) warnings.push("Chưa xác định chắc chắn toàn bộ dịch vụ trong cùng một phòng. Hãy chọn lại dịch vụ.");
    services = [];
  }
  let date = data.date;
  if (data.ambiguousFields.includes("date") || (date && !validBookingDate(date, now))) {
    warnings.push("Hãy chọn ngày cụ thể từ hôm nay đến 30 ngày tới.");
    date = null;
  }
  const timePreference = data.ambiguousFields.includes("timePreference") ? null : data.timePreference;
  if (department && timePreference) {
    const duration = services.length ? services.reduce((sum, name) => sum + department.services.find(service => service.name === name).estimatedDuration, 0) : 1;
    const rejection = validateWorkingTime(department, timePreference, duration);
    if (rejection) return rejection;
  }
  if (data.ambiguousFields.length) warnings.push("Có thông tin chưa rõ; vui lòng kiểm tra và bổ sung trong form.");
  const missingFields = [];
  if (!department) missingFields.push("departmentId");
  if (!services.length) missingFields.push("services");
  if (!date) missingFields.push("date");
  if (data.ambiguousFields.includes("timePreference")) missingFields.push("timePreference");
  if (department && services.length && date) {
    const duration = services.reduce((sum, name) => sum + department.services.find(service => service.name === name).estimatedDuration, 0);
    const slots = slotsFor(department, date, duration, now);
    if (!slots.length) {
      scheduleIssue = "Ngày này không có khung giờ phù hợp với lịch làm việc và thời lượng dịch vụ.";
      warnings.push(scheduleIssue);
      missingFields.push("date");
      date = null;
    } else if (timePreference && !slots.some(slot => matchesPreference(slot, timePreference))) {
      return rejectTime("Không thể đặt lịch vào giờ hoặc buổi đã yêu cầu: khung giờ phải còn ở tương lai và đủ thời lượng dịch vụ. Yêu cầu này đã bị từ chối.");
    }
  }
  const questions = {
    departmentId: "Bạn muốn đến phòng nào?",
    services: "Bạn cần thực hiện thủ tục gì và với mục đích nào? Hãy nêu rõ dịch vụ để tránh chọn nhầm.",
    date: "Bạn muốn đến ngày nào trong 30 ngày tới, vào ngày phòng có nhận lịch?",
    timePreference: "Bạn có thể chọn giờ khác hoặc ghi rõ giờ và buổi muốn đến không?",
  };
  return { status: missingFields.length ? "needs_input" : "ready", missingFields, warnings,
    message: missingFields.length ? [scheduleIssue, ...missingFields.map(field => questions[field])].filter(Boolean).join(" ") : "Thông tin đã sẵn sàng để bạn kiểm tra và chọn chỗ trống.",
    draft: { departmentId: department ? String(department._id) : null,
      departmentName: department?.vietnameseName || department?.name || null,
      services, date, timePreference, notes: data.notes.trim() } };
}

async function createBookingDraft(body, student, options = {}) {
  usage.setPrompt(prompt.version);
  const message = body?.message;
  if (typeof message !== "string" || !message.trim() || message.length > getAiConfig().maxQuestionLength) {
    throw new AiError("AI_INVALID_INPUT", "Nhập nhu cầu đặt lịch từ 1 đến 2.000 ký tự.", 400);
  }
  if (!student?._id || student.role !== "student" || student.isActive === false) {
    throw new AiError("AI_AUTH_REQUIRED", "Cần đăng nhập bằng tài khoản sinh viên đang hoạt động.", 403);
  }
  if (!getAiConfig().hasApiKey) throw new AiError("AI_NOT_CONFIGURED", "Chưa cấu hình AI. Bạn vẫn có thể mở form đặt lịch.", 503);
  const startedAt = Date.now();
  for (const [id, state] of users) if (!state.busy && startedAt - state.startedAt >= 60000) users.delete(id);
  const id = String(student._id);
  const state = users.get(id) || { startedAt, count: 0, busy: false };
  if (state.busy || state.count >= 10) throw new AiError("AI_RATE_LIMIT", "Hãy chờ yêu cầu hiện tại hoàn tất hoặc thử lại sau một phút.", 429);
  state.busy = true; state.count++; users.set(id, state);
  const metrics = { event: "ai_booking_draft", requestId: usage.requestId() || randomUUID(), promptVersion: prompt.version,
    model: getAiConfig().chatModel, toolsCalled: [] };
  try {
    const departments = await (options.loadCatalog || (() => Department.find({ isActive: true, isArchived: { $ne: true }, bookingEnabled: { $ne: false } })
      .select("name vietnameseName description services workingHours bookingWeekdays bookingExcludedDates").lean()))();
    const catalog = departments.map(item => ({ ...item, services: item.services.filter(service => Number.isInteger(service.estimatedDuration) && service.estimatedDuration > 0) }))
      .filter(item => item.services.length);
    if (!catalog.length) throw new AiError("AI_NO_BOOKING_SERVICES", "Hiện chưa có dịch vụ có thể đặt lịch. Vui lòng kiểm tra danh mục phòng.", 503);
    const rejection = validateExplicitRequest(message, catalog);
    if (rejection) {
      metrics.outcome = "rejected";
      usage.setOutcome("rejected", rejection.reasonCode);
      return { ...rejection, requestId: metrics.requestId };
    }
    const catalogContext = publicCatalog(catalog);
    if (JSON.stringify(catalogContext).length > 60000) throw new AiError("AI_CATALOG_LIMIT", "Danh mục quá lớn để phân tích lúc này. Hãy chọn dịch vụ bằng form.", 503);
    const now = options.now || new Date();
    const generated = await (options.generate || provider.generateStructured)({ system: prompt.system,
      input: { message: message.trim(), catalog: catalogContext, referenceDate: dateInVietnam(now), timeZone: "Asia/Ho_Chi_Minh" },
      schema: bookingJsonSchema, jsonSchema: true });
    Object.assign(metrics, { inputTokens: generated.usage?.promptTokenCount ?? null,
      outputTokens: generated.usage?.candidatesTokenCount ?? null, totalTokens: generated.usage?.totalTokenCount ?? null });
    const result = normalizeDraft(generated.data, catalog, now);
    metrics.outcome = result.status;
    usage.setOutcome(result.status === "rejected" ? "rejected" : result.status === "out_of_scope" ? "refused" : result.status === "needs_input" ? "needs_input" : "success",
      result.reasonCode || (result.status === "out_of_scope" ? "OUT_OF_SCOPE" : undefined));
    return { ...result, requestId: metrics.requestId };
  } catch (error) {
    usage.recordError(error);
    metrics.outcome = "error";
    metrics.code = error instanceof AiError ? error.code : "AI_BOOKING_UNAVAILABLE";
    if (error instanceof AiError) throw error;
    throw new AiError("AI_BOOKING_UNAVAILABLE", "Chưa thể phân tích yêu cầu. Bạn vẫn có thể đặt lịch bằng form.", 503);
  } finally {
    state.busy = false;
    // Never log user messages, notes, identity, catalog contents or credentials.
    console.info(JSON.stringify({ ...metrics, latencyMs: Date.now() - startedAt }));
  }
}

module.exports = { getBookingStatus, createBookingDraft, normalizeDraft };
