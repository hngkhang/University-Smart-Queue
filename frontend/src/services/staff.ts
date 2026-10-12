import { readSession } from "./session";
import type { StaffVisit } from "../features/staff/demo";

export interface StaffQueue {
  current: StaffVisit | null;
  waiting: StaffVisit[];
  history: StaffVisit[];
  paused: boolean;
  isOpen: boolean;
  completedToday: number;
}
export type StaffAction = "call" | "start" | "recall" | "complete" | "no_show" | "cancel" | "pause";
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const session = readSession();
  if (!session || session.user.role !== "staff") throw new Error("Please sign in with your staff account.");
  const response = await fetch(`${API_BASE_URL}/staff${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
  });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (!response.ok || !data) throw new Error(data?.message || "Staff service is unavailable. Please try again.");
  return data as T;
}
export const fetchStaffQueue = () => request<StaffQueue>("/queue");
export const updateStaffQueue = (action: StaffAction, id?: string, paused?: boolean) => {
  if (action === "call") return request<{ message: string }>("/queue/call", { method: "POST" });
  if (action === "pause") return request("/queue/pause", { method: "PATCH", body: JSON.stringify({ paused }) });
  return request(`/tickets/${encodeURIComponent(id || "")}/${action}`, { method: "PATCH" });
};
