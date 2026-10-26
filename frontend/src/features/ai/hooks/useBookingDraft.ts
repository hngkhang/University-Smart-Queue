import { useEffect, useRef, useState } from "react";
import { createBookingDraft, fetchBookingStatus } from "../../../services/ai";
import type { BookingDraftResult, BookingStatus } from "../types";

export function useBookingDraft(open: boolean) {
  const [status, setStatus] = useState<BookingStatus | null>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<BookingDraftResult | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchBookingStatus(controller.signal).then(value => {
      if (!controller.signal.aborted) { setStatus(value); setError(""); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setStatus(null); setError(reason instanceof Error ? reason.message : "Chưa thể kết nối."); }
    });
    return () => controller.abort();
  }, [open, retry]);

  async function send() {
    if (request.current || !status?.canDraft || !text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setSending(true); setResult(null); setError("");
    try {
      const value = await createBookingDraft(text.trim(), controller.signal);
      if (!controller.signal.aborted) setResult(value);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Chưa thể phân tích yêu cầu.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }
  return { status, text, setText: (value: string) => { setText(value); setResult(null); },
    result, error, sending, send, refresh: () => setRetry(value => value + 1) };
}
