export interface AiMetrics {
  requests: number; providerCalls: number; knownCostUsd: number; completeCostUsd: number;
  pricedRequests: number; estimatedRequests: number; billingKnownRequests: number; billingEstimateUsd: number;
  avgLatencyMs: number | null; avgCostUsd: number | null;
  inputTokens: number; outputTokens: number; thinkingTokens: number;
  success: number; needs_input: number; refused: number; failed: number; rejected: number; cancelled: number;
}
export interface AiSummary {
  totals: AiMetrics; features: (AiMetrics & { _id: string })[]; models: string[];
  from: string; to: string; scope: string; generatedAt: string; pricingVersion: string;
  logging: { failedWrites: number; pendingWrites: number; since: string; lastFailureAt: string | null };
}
export interface AiCall {
  callId: string; kind: string; model: string; latencyMs: number; status: string; errorCode?: string;
  usage: { inputTokens: number | null; outputTokens: number | null; thinkingTokens: number; cachedTokens: number; source: string };
  costUsd: number | null;
  price: { input: number; output: number; cached: number; version: string; source: string; checkedAt: string } | null;
}
export interface AiLog {
  requestId: string; startedAt: string; endedAt: string; feature: string; transport: string; status: string;
  reasonCode?: string; promptVersion: string; models: string[]; latencyMs: number; costUsd: number | null;
  knownCostUsd: number; costStatus: string; billingTier: string; billingEstimateUsd: number | null;
  inputTokens: number | null; outputTokens: number | null; thinkingTokens: number | null;
  providerCalls?: AiCall[]; toolsCalled?: string[];
}
export const features: Record<string, string> = { rag_chat: "Hỏi đáp RAG", booking_draft: "Điền lịch AI", knowledge_ingest: "Nạp tài liệu" };
export const statuses: Record<string, string> = { success: "Thành công", needs_input: "Cần bổ sung", refused: "Từ chối trả lời", failed: "Lỗi", rejected: "Bị chặn", cancelled: "Đã ngắt" };
export const money = (value: number | null | undefined) => value == null ? "Chưa xác định" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(value);
export const duration = (value: number | null | undefined) => value == null ? "—" : `${(value / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} s`;
export const localDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
