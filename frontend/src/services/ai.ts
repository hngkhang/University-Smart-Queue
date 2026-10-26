import { readSession } from "./session";
import type { AssistantSource, AssistantStatus } from "../features/ai/types";
import type { BookingDraftResult, BookingStatus } from "../features/ai/types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

async function request(path: string, options: RequestInit) {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(path.endsWith("status") ? 15000 : 120000);
    response = await fetch(`${API_BASE_URL}/ai${path}`, {
      ...options, signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("Trợ lý phản hồi quá lâu. Vui lòng kiểm tra kết nối và thử lại.", { cause: error });
    }
    throw new Error("Chưa thể kết nối với trợ lý. Bạn vẫn có thể sử dụng các chức năng khác và thử lại sau.", { cause: error });
  }
  const body = response.headers.get("content-type")?.includes("application/json")
    ? await response.json() : null;
  if (!response.ok || !body) {
    throw new Error(body?.message || "Chưa thể kết nối với trợ lý. Vui lòng thử lại sau.");
  }
  return body;
}

export async function fetchBookingStatus(signal: AbortSignal): Promise<BookingStatus> {
  const data = await request("/booking-status", { signal });
  if (typeof data.canDraft !== "boolean" || typeof data.message !== "string") throw new Error("Chưa thể kiểm tra kết nối đặt lịch.");
  return data;
}

export async function createBookingDraft(message: string, signal: AbortSignal): Promise<BookingDraftResult> {
  const session = readSession();
  if (session?.user.role !== "student") throw new Error("Đăng nhập bằng tài khoản sinh viên để được hỗ trợ đặt lịch.");
  const data = await request("/booking-draft", { method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ message }),
  });
  const noDraft = data.status === "out_of_scope" || data.status === "rejected";
  if (!["ready", "needs_input", "out_of_scope", "rejected"].includes(data.status) ||
      (data.message !== undefined && typeof data.message !== "string") ||
      (data.status === "rejected" && (typeof data.message !== "string" || !data.message.trim())) ||
      !Array.isArray(data.warnings) || !data.warnings.every((value: unknown) => typeof value === "string") ||
      !Array.isArray(data.missingFields) || typeof data.requestId !== "string" ||
      (noDraft && data.draft !== null) ||
      (!noDraft && (!data.draft || !Array.isArray(data.draft.services) ||
        !data.draft.services.every((value: unknown) => typeof value === "string") || typeof data.draft.notes !== "string"))) {
    throw new Error("Chưa nhận được bản nháp hợp lệ. Bạn có thể mở form đặt lịch.");
  }
  return data;
}

export async function fetchAssistantStatus(signal: AbortSignal): Promise<AssistantStatus> {
  const data = await request("/status", { signal });
  if (!["setup_required", "ready"].includes(data.state) || typeof data.canChat !== "boolean" || typeof data.message !== "string") {
    throw new Error("Trợ lý tạm thời chưa sẵn sàng.");
  }
  return data;
}

export async function sendAssistantMessage(message: string, signal: AbortSignal, onPartial: (answer: string) => void): Promise<{
  answer: string; sources: AssistantSource[];
}> {
  const session = readSession();
  if (!session) throw new Error("Vui lòng đăng nhập để gửi câu hỏi.");
  const timeout = AbortSignal.timeout(120000);
  const combinedSignal = AbortSignal.any([signal, timeout]);
  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: "POST", signal: combinedSignal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ message }),
    });
    if (!response.ok) {
      const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
      throw new Error(body?.message || "Chưa thể gửi câu hỏi. Vui lòng thử lại.");
    }
    if (!response.body) throw new Error("Trình duyệt không nhận được luồng trả lời.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let result: { answer: string; sources: AssistantSource[] } | null = null;
    try {
      while (true) {
        const { done, value } = await reader.read();
        pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        if (pending.length > 100000) throw new Error("Phản hồi của trợ lý vượt giới hạn cho phép.");
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.length > 100000) throw new Error("Phản hồi của trợ lý vượt giới hạn cho phép.");
          const event = JSON.parse(line);
          if (event.type === "partial" && typeof event.answer === "string") onPartial(event.answer);
          else if (event.type === "done" && typeof event.answer === "string" && event.answer.trim() && Array.isArray(event.sources)) {
            result = { answer: event.answer, sources: event.sources };
          } else if (event.type === "error") throw new Error(event.message || "Trợ lý tạm thời gặp lỗi. Vui lòng thử lại.");
          else throw new Error("Phản hồi của trợ lý không hợp lệ.");
        }
        if (done) break;
      }
    } finally {
      if (!result) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (pending.trim() || !result) throw new Error("Câu trả lời bị ngắt giữa chừng. Vui lòng thử lại.");
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    if (timeout.aborted) throw new Error("Trợ lý phản hồi quá lâu. Vui lòng thử lại.", { cause: error });
    if (error instanceof TypeError) throw new Error("Chưa thể kết nối với trợ lý. Vui lòng thử lại.", { cause: error });
    throw error;
  }
}
