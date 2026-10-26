import type { AssistantSource } from "../types";

export default function SourceCard({ source }: { source: AssistantSource }) {
  return <details className="sq-ai-source">
    <summary>[{source.label}] {source.section}</summary>
    <small>Phiên bản {source.version}</small>
    <p>{source.excerpt || "Chưa có đoạn trích để hiển thị."}</p>
  </details>;
}
