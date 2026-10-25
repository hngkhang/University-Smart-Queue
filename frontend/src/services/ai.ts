import { readSession } from "./session";
import type { AssistantSource, AssistantStatus } from "../features/ai/types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

async function request(path: string, options: RequestInit) {
  let response: Response;
  try {
    const timeout = AbortSignal.timeout(path === "/status" ? 15000 : 120000);
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
