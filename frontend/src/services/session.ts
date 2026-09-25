export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "staff" | "admin";
  studentID: string;
  phone: string;
}

export const SESSION_CHANGED_EVENT = "smartqueue:session-changed";

export function clearSession() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem("smartqueue_token");
    storage.removeItem("smartqueue_user");
  }
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function saveSession(token: string, user: SessionUser, rememberMe: boolean) {
  const storage = rememberMe ? localStorage : sessionStorage;
  const inactiveStorage = rememberMe ? sessionStorage : localStorage;

  storage.setItem("smartqueue_token", token);
  storage.setItem("smartqueue_user", JSON.stringify(user));
  inactiveStorage.removeItem("smartqueue_token");
  inactiveStorage.removeItem("smartqueue_user");
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
}

export function readSession() {
  for (const storage of [localStorage, sessionStorage]) {
    const token = storage.getItem("smartqueue_token");
    const raw = storage.getItem("smartqueue_user");
    if (!token || !raw) continue;
    try {
      const user = JSON.parse(raw) as SessionUser;
      const parts = token.split(".");
      if (parts.length !== 3) continue;
      const payload = JSON.parse(
        atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
      ) as {
        id?: string;
        role?: string;
        exp?: number;
      };
      if (
        user &&
        typeof user.id === "string" &&
        typeof user.fullName === "string" &&
        ["student", "staff", "admin"].includes(user.role) &&
        payload.id === user.id &&
        payload.role === user.role &&
        typeof payload.exp === "number" &&
        payload.exp * 1000 > Date.now()
      )
        return { token, user };
    } catch {
      // Client-side session checks only. Booking APIs must verify the JWT signature.
    }
  }
  return null;
}
