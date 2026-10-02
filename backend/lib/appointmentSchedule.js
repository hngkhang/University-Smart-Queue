const MINUTE = 60000;
const DEFAULT_WORKING_HOURS = "07:30 - 11:30 | 13:00 - 16:30";
const dateInVietnam = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);

function validBookingDate(date, now = new Date()) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const today = dateInVietnam(now);
  const last = new Date(`${today}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 30);
  return date >= today && date <= last.toISOString().slice(0, 10);
}

function workingPeriods(hours) {
  const parts = (hours || DEFAULT_WORKING_HOURS).split("|");
  const periods = parts.map((part) => {
    const match = part.trim().match(/^(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [h1, m1, h2, m2] = match.slice(1).map(Number);
    const start = h1 * 60 + m1, end = h2 * 60 + m2;
    return h1 < 24 && h2 < 24 && m1 < 60 && m2 < 60 && start < end
      ? [start, end] : null;
  });
  if (periods.some((period) => !period)) return [];
  periods.sort((a, b) => a[0] - b[0]);
  if (periods.some((period, i) => i > 0 && period[0] < periods[i - 1][1])) return [];
  return periods;
}

function slotsFor(department, date, duration, now = new Date()) {
  if (!validBookingDate(date, now) || !Number.isInteger(duration) || duration <= 0 || duration > 1440) return [];
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (!(department.bookingWeekdays ?? [1, 2, 3, 4, 5]).includes(weekday) ||
      (department.bookingExcludedDates ?? []).includes(date)) return [];
  const midnight = new Date(`${date}T00:00:00+07:00`).getTime();
  const slots = [];
  for (const [start, end] of workingPeriods(department.workingHours)) {
    for (let minute = start; minute + duration <= end; minute += 15) {
      const startsAt = new Date(midnight + minute * MINUTE);
      if (startsAt <= now) continue;
      slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + duration * MINUTE) });
    }
  }
  return slots;
}

function reservedMinutes(startsAt, endsAt) {
  const result = [];
  for (let time = startsAt.getTime(); time < endsAt.getTime(); time += MINUTE) result.push(time / MINUTE);
  return result;
}

module.exports = { DEFAULT_WORKING_HOURS, validBookingDate, workingPeriods, slotsFor, reservedMinutes };
