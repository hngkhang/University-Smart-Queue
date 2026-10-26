import { useNavigate } from "react-router";
import { useEffect, useRef } from "react";
import { saveBookingHandoff, timePreferenceLabel } from "../bookingHandoff";
import type { BookingDraftResult } from "../types";

export default function BookingDraftCard({ result, onClose }: { result: BookingDraftResult; onClose: () => void }) {
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { draft } = result;
  const ready = result.status === "ready" && draft;
  return <section className="sq-ai-booking-card" aria-label="Kết quả yêu cầu đặt lịch" aria-live="polite">
    <h3 ref={heading} tabIndex={-1}>{ready ? "Kiểm tra lịch hẹn" : result.status === "rejected" ? "Yêu cầu bị từ chối" : result.status === "needs_input" ? "Cần làm rõ một chút" : "Chưa thể tạo lịch hẹn"}</h3>
    {!ready && <p className="sq-ai-clarification">{result.message || result.warnings.join(" ")}</p>}
    {ready && draft && <dl>
      <dt>Phòng</dt><dd>{draft.departmentName || "Chọn thêm trong form"}</dd>
      <dt>Dịch vụ</dt><dd>{draft.services.join(", ") || "Chọn thêm trong form"}</dd>
      <dt>Ngày</dt><dd>{draft.date ? draft.date.split("-").reverse().join("/") : "Chọn thêm trong form"}</dd>
      <dt>Ưu tiên</dt><dd>{timePreferenceLabel(draft.timePreference)}</dd>
      {draft.notes && <><dt>Ghi chú</dt><dd>{draft.notes}</dd></>}
    </dl>}
    {draft && <>
      {ready && <p>Chưa giữ chỗ. Bạn sẽ chọn giờ trống và xác nhận ở bước tiếp theo.</p>}
      <button type="button" className="sq-ai-booking-continue" onClick={() => {
        try {
          const key = saveBookingHandoff(draft);
          navigate(`/appointments/new${draft.departmentId ? `?department=${encodeURIComponent(draft.departmentId)}` : ""}`, { state: { bookingDraftKey: key } });
        } catch { navigate("/login?redirect=%2Fappointments%2Fnew"); }
        onClose();
      }}>{ready ? "Chọn giờ và xác nhận" : "Bổ sung trong form"}</button>
    </>}
  </section>;
}
