import { useEffect, useRef, useState } from "react";
import { fetchStaffQueue, updateStaffQueue } from "../../services/staff";
import type { StaffAction, StaffQueue } from "../../services/staff";

export function useStaffQueue(enabled: boolean) {
  const [data, setData] = useState<StaffQueue | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const revision = useRef(0);
  const epoch = useRef(0);

  useEffect(() => {
    const generation = ++epoch.current;
    let pending = false;
    async function load() {
      if (!enabled || pending || lock.current) return;
      pending = true;
      const version = revision.current;
      try {
        const result = await fetchStaffQueue();
        if (generation === epoch.current && version === revision.current) {
          setData(result);
          setError("");
        }
      } catch (reason) {
        if (generation === epoch.current && version === revision.current)
          setError(reason instanceof Error ? reason.message : "Unable to load the queue.");
      } finally { pending = false; }
    }
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      epoch.current = generation + 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, retry]);

  async function act(action: StaffAction, id?: string) {
    if (!enabled || lock.current) return false;
    lock.current = true;
    revision.current++;
    const generation = epoch.current;
    setBusy(true);
    setNotice("");
    let failure = "";
    try {
      await updateStaffQueue(action, id, !data?.paused);
    } catch (reason) {
      failure = reason instanceof Error ? reason.message : "Unable to update the visit.";
    }
    // Refresh after both success and conflict; never leave an optimistic status on screen.
    try {
      const result = await fetchStaffQueue();
      if (generation === epoch.current) setData(result);
    } catch {
      failure ||= "The action was saved, but the queue could not be refreshed. Refresh before continuing.";
    } finally {
      lock.current = false;
      if (generation === epoch.current) {
        setBusy(false);
        setError(failure);
        if (!failure) setNotice(action === "recall" ? "Student called again." : "Queue updated successfully.");
      }
    }
    return !failure;
  }
  return { data, error, notice, busy, act, refresh: () => setRetry((value) => value + 1) };
}
