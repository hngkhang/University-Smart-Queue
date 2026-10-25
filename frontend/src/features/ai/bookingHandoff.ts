import { readSession, SESSION_CHANGED_EVENT } from "../../services/session";
import type { BookingDraft } from "./types";

// Only a random key enters browser history. Notes and drafts stay in memory.
let pending: { key: string; userId: string; expiresAt: number; draft: BookingDraft } | null = null;
window.addEventListener(SESSION_CHANGED_EVENT, () => { pending = null; });
window.addEventListener("storage", () => { pending = null; });

export function saveBookingHandoff(draft: BookingDraft) {
  const session = readSession();
  if (session?.user.role !== "student") throw new Error("Vui lòng đăng nhập lại.");
  const key = crypto.randomUUID();
  pending = { key, userId: session.user.id, expiresAt: Date.now() + 10 * 60000, draft: structuredClone(draft) };
  return key;
}

export function readBookingHandoff(key: unknown): BookingDraft | null {
  if (!pending || pending.key !== key || pending.userId !== readSession()?.user.id || pending.expiresAt <= Date.now()) return null;
  return structuredClone(pending.draft);
}

export function timePreferenceLabel(preference: BookingDraft["timePreference"]) {
  if (!preference) return "Chưa chọn giờ";
  const period = { any: "", morning: "Buổi sáng", afternoon: "Buổi chiều", evening: "Buổi tối" }[preference.period];
  return [period, preference.time ? `Khoảng ${preference.time}` : ""].filter(Boolean).join(" · ") || "Chưa chọn giờ";
}

export function matchesTimePreference(startsAt: string, preference: BookingDraft["timePreference"]) {
  if (!preference) return false;
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(startsAt));
  if (preference.time) return localTime === preference.time;
  const hour = Number(localTime.slice(0, 2));
  return preference.period === "morning" ? hour < 12 : preference.period === "afternoon" ? hour >= 12 && hour < 18 : preference.period === "evening" ? hour >= 18 : false;
}
