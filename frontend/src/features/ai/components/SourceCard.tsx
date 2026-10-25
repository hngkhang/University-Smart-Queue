import { BookOpen } from "lucide-react";
import type { AssistantSource } from "../types";

export default function SourceCard({ source }: { source: AssistantSource }) {
  return <details className="sq-ai-source">
    <summary><BookOpen size={14} aria-hidden="true" />
      <span>[{source.label}] {source.section} · Phiên bản {source.version}<small>Xem nguồn tham khảo</small></span>
    </summary>
    <p>{source.excerpt || "Chưa có đoạn trích để hiển thị."}</p>
  </details>;
}
