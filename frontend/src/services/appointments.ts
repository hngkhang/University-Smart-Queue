import type { Appointment, AppointmentSlot } from "../types";
import { readSession } from "./session";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

export class AppointmentError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const session = readSession();
  if (!session)
    throw new AppointmentError("Please sign in to manage appointments.", 401);
  if (session.user.role !== "student")
    throw new AppointmentError(
      "Please sign in with a student account to book appointments.",
      403,
    );
  const response = await fetch(`${API_BASE_URL}/appointments${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      ...options?.headers,
    },
  });
  if (response.status === 404 || response.status === 501) {
    throw new AppointmentError(
      "Appointment booking is not available yet. Please try again later.",
      response.status,
    );
  }
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : null;
  if (!response.ok)
    throw new AppointmentError(
      data?.message ||
        "Unable to process your request. Please try again later.",
      response.status,
    );
  if (!data)
    throw new AppointmentError(
      "Appointment booking is temporarily unavailable.",
      502,
    );
  return data as T;
}

export const fetchAvailability = (
  departmentId: string,
  service: string,
  date: string,
  signal?: AbortSignal,
) =>
  request<{ slots: AppointmentSlot[] }>(
    `/availability?${new URLSearchParams({ departmentId, service, date })}`,
    { signal },
  );

export const fetchAppointments = () =>
  request<{ appointments: Appointment[] }>("/");

export const createAppointment = (booking: {
  departmentId: string;
  service: string;
  date: string;
  startsAt: string;
  notes: string;
}) =>
  request<{ appointment: Appointment }>("/", {
    method: "POST",
    body: JSON.stringify(booking),
  });

export const cancelAppointment = (id: string) =>
  request<{ appointment: Appointment }>(`/${encodeURIComponent(id)}/cancel`, {
    method: "PATCH",
  });

export const appointmentTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
export const appointmentDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
export const todayInVietnam = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );
