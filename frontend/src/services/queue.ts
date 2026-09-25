import type { QueueTicket } from "../types";
import { readSession } from "./session";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

export class QueueError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const session = readSession();
  if (!session)
    throw new QueueError("Please sign in to manage your queue.", 401);
  if (session.user.role !== "student")
    throw new QueueError("Please use a student account to join a queue.", 403);
  const response = await fetch(`${API_BASE_URL}/queue${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      ...options?.headers,
    },
  });
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok || !data) {
    throw new QueueError(
      data?.message || "Queue service is unavailable. Please try again later.",
      response.status,
      data?.code,
    );
  }
  return data as T;
}

export const fetchMyQueue = () =>
  request<{ ticket: QueueTicket | null; history: QueueTicket[] }>("/mine");
export const joinQueue = (data: {
  departmentId: string;
  services: string[];
  notes: string;
}) =>
  request<{ ticket: QueueTicket }>("/", {
    method: "POST",
    body: JSON.stringify(data),
  });
export const cancelQueueTicket = (id: string) =>
  request<{ ticket: QueueTicket }>(`/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
  });
export const durationLabel = (minutes: number | null | undefined) =>
  minutes != null && minutes > 0 ? `~${minutes} min` : "Not available yet";
