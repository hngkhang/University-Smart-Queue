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
  if (!["ready", "needs_input", "out_of_scope"].includes(data.status) ||
      !Array.isArray(data.warnings) || !data.warnings.every((value: unknown) => typeof value === "string") ||
      !Array.isArray(data.missingFields) || typeof data.requestId !== "string" ||
      (data.status !== "out_of_scope" && (!data.draft || !Array.isArray(data.draft.services) ||
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

export async function sendAssistantMessage(message: string, signal: AbortSignal): Promise<{
  answer: string; sources: AssistantSource[];
}> {
  const session = readSession();
  if (!session) throw new Error("Vui lòng đăng nhập để gửi câu hỏi.");
  const data = await request("/chat", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ message }),
  });
  if (typeof data.answer !== "string" || !data.answer.trim() || !Array.isArray(data.sources)) {
    throw new Error("Chưa thể nhận câu trả lời hợp lệ. Vui lòng thử lại.");
  }
  return data;
}
