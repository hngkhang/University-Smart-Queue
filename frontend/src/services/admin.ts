import { clearSession, readSession } from "./session";

export interface AdminSummary {
  students: number;
  staff: number;
  pending: number;
  completed: number;
  rejected: number;
}
export interface Account {
  _id: string;
  fullName: string;
  email: string;
  role: "student" | "staff";
  studentID: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  department: { _id: string; name: string } | null;
}
export interface PasswordRequest extends Omit<Account, "department"> {
  userId: string;
  department: string;
  note: string;
  status: "pending" | "completed" | "rejected";
  resolvedAt: string | null;
  resolvedByName: string;
  reason: string;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export async function adminApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const session = readSession();
  if (!session) {
    clearSession();
    throw new Error("Please sign in again.");
  }
  const response = await fetch(
    `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api"}/admin${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
    },
  );
  if (response.status === 401) clearSession();
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Unable to load admin data.");
  return data as T;
}
