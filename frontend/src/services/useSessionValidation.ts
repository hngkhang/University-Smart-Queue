import { useEffect, useState } from "react";
import { clearSession, readSession, SESSION_CHANGED_EVENT } from "./session";

// Refresh current account authorization even in workspaces using local demo data.
export function useSessionValidation() {
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const update = () => setSession(readSession());
    window.addEventListener(SESSION_CHANGED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let inFlight = false;
    async function validate() {
      if (inFlight || document.visibilityState !== "visible") return;
      if (!readSession()) {
        clearSession();
        return;
      }
      inFlight = true;
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api"}/auth/session`,
          {
            headers: { Authorization: `Bearer ${session!.token}` },
            signal: controller.signal,
          },
        );
        if (
          !controller.signal.aborted &&
          [401, 403].includes(response.status) &&
          readSession()?.token === session!.token
        )
          clearSession();
      } catch {
        // Network failures do not revoke an otherwise valid local session.
      } finally {
        inFlight = false;
      }
    }
    void validate();
    const timer = window.setInterval(() => void validate(), 30000);
    document.addEventListener("visibilitychange", validate);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", validate);
    };
  }, [session]);
}
