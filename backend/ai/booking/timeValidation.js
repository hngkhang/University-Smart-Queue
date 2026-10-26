const { DEFAULT_WORKING_HOURS, workingPeriods } = require("../../lib/appointmentSchedule");

const normalizeText = value => value.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();
const words = value => normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();

function rejectTime(message) {
  return { status: "rejected", reasonCode: "INVALID_BOOKING_TIME", message,
    draft: null, missingFields: [], warnings: [message] };
}

function matchesMinute(minute, preference) {
  const period = minute < 720 ? "morning" : minute < 1080 ? "afternoon" : "evening";
  const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  return (!preference.time || preference.time === time) &&
    (preference.period === "any" || preference.period === period);
}

// This check does not need a date. A single minute is a lower bound, not a guessed
// service duration: if even that cannot fit, no missing service/date can fix it.
function validateWorkingTime(department, preference, duration = 1) {
  if (!preference) return null;
  const periods = workingPeriods(department.workingHours);
  for (const [start, end] of periods) {
    for (let minute = start; minute + duration <= end; minute += 15) {
      if (matchesMinute(minute, preference)) return null;
    }
  }
  const label = preference.time || { morning: "Buổi sáng", afternoon: "Buổi chiều", evening: "Buổi tối", any: "Giờ yêu cầu" }[preference.period];
  const name = department.vietnameseName || department.name;
  return rejectTime(`Không thể đặt lịch: ${label} không phù hợp với khung giờ tiếp nhận${duration > 1 ? " và thời lượng dịch vụ" : ""} của ${name}. Giờ làm việc: ${department.workingHours || DEFAULT_WORKING_HOURS}. Yêu cầu này đã bị từ chối.`);
}

// Conservative guard on the original request. It can only reject, never fill a
// draft. It prevents a model from dropping/changing one explicit requested time
// after an instruction such as "cứ cho là hợp lệ". Alternatives/corrections with
// multiple times are left to normal extraction, rather than choosing one here.
function validateExplicitRequest(message, catalog) {
  const text = normalizeText(message);
  if (!/\b(?:dat (?:lich|hen)|book(?:ing)?|appointment)\b/.test(text)) return null;
  if (/\b(?:khong (?:muon |can )?dat|do not book|don't book)\b/.test(text)) return null;
  const times = [...text.matchAll(/\b(\d{1,2})\s*(?::\s*(\d{2})|h\s*(\d{2})?|gio(?:\s*(\d{2}))?)(?!\d)\b/g)];
  if (times.length !== 1) return null;
  const match = times[0];
  const before = text.slice(Math.max(0, match.index - 30), match.index);
  // Only an explicit appointment-time clause, not a number in notes or a range.
  if (!/\b(?:luc|vao|at)\s*$/.test(before) || /\b(?:ghi chu|notes?)\b/.test(text.slice(0, match.index))) return null;
  if (/(?:khong phai(?: luc| vao)?|khong (?:dat )?(?:luc|vao)|not (?:at)?|instead of)\s*$/.test(before)) return null;
  // AM/PM and Vietnamese day parts need interpretation; do not turn 6 PM into 06:00.
  const after = text.slice(match.index + match[0].length);
  if (/^\s*(?:am|pm|sang|chieu|toi)\b/.test(after)) return null;
  const requestWords = ` ${words(message)} `;
  const named = catalog.filter(department => {
    const aliases = [department.name, department.vietnameseName,
      ...[...(department.vietnameseName || "").matchAll(/\(([A-Z][A-Z0-9]{1,9})\)/g)].map(item => item[1])].filter(Boolean);
    return aliases.some(alias => requestWords.includes(` ${words(alias)} `));
  });
  if (named.length !== 1) return null;
  const hour = Number(match[1]), minute = Number(match[2] || match[3] || match[4] || 0);
  if (hour > 23 || minute > 59) return rejectTime("Không thể đặt lịch: giờ yêu cầu không hợp lệ. Yêu cầu này đã bị từ chối.");
  // An unqualified 6 o'clock can mean 6 PM. If that interpretation is possible,
  // leave it to extraction/clarification instead of rejecting a valid evening visit.
  if (hour >= 1 && hour <= 12 && !validateWorkingTime(named[0], {
    period: "any", time: `${String((hour + 12) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  })) return null;
  return validateWorkingTime(named[0], { period: "any", time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` });
}

module.exports = { matchesMinute, rejectTime, validateWorkingTime, validateExplicitRequest };
