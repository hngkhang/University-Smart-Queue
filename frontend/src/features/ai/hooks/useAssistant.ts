import { useEffect, useRef, useState } from "react";
import { fetchAssistantStatus, sendAssistantMessage } from "../../../services/ai";
import type { AssistantMessage, AssistantStatus } from "../types";

export function useAssistant(open: boolean) {
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0);
  const [draft, setDraft] = useState("");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fetchAssistantStatus(controller.signal)
      .then((value) => { setStatus(value); setError(""); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setStatus(null);
          setError(reason instanceof Error ? reason.message : "Không thể kết nối với trợ lý.");
        }
      });
    return () => controller.abort();
  }, [open, retry]);

  async function send(text: string) {
    if (request.current || !status?.canChat || !text.trim()) return false;
    const controller = new AbortController();
    request.current = controller;
    setSending(true);
    setError("");
    const assistantId = crypto.randomUUID();
    setMessages((previous) => [...previous,
      { id: crypto.randomUUID(), role: "user", content: text.trim() },
      { id: assistantId, role: "assistant", content: "" },
    ]);
    try {
      const result = await sendAssistantMessage(text.trim(), controller.signal, (answer) => {
        if (mounted.current) setMessages((previous) => previous.map((item) =>
          item.id === assistantId ? { ...item, content: answer } : item));
      });
      if (mounted.current) setMessages((previous) => previous.map((item) =>
        item.id === assistantId ? { ...item, content: result.answer, sources: result.sources } : item));
      return true;
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted) {
        setMessages((previous) => previous.filter((item) => item.id !== assistantId));
        setError(reason instanceof Error ? reason.message : "Chưa thể gửi câu hỏi.");
      }
      return false;
    } finally {
      request.current = null;
      if (mounted.current) setSending(false);
    }
  }

  return { status, error, messages, sending, send, draft, setDraft, refresh: () => setRetry((value) => value + 1) };
}
